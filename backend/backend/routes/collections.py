import asyncio
import json
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.db import database
from backend.routes.companies import (
    CompanyBatchOutput,
    fetch_companies_with_liked,
)

router = APIRouter(
    prefix="/collections",
    tags=["collections"],
)


class CompanyCollectionMetadata(BaseModel):
    id: uuid.UUID
    collection_name: str


class CompanyCollectionOutput(CompanyBatchOutput, CompanyCollectionMetadata):
    pass


class AddCompaniesRequest(BaseModel):
    company_ids: List[int]


class AddCompaniesResponse(BaseModel):
    message: str
    added_count: int
    total_companies_in_target: int
    progress: dict = None


class CollectionCompanyIdsResponse(BaseModel):
    company_ids: List[int]
    total_count: int


@router.get("", response_model=list[CompanyCollectionMetadata])
def get_all_collection_metadata(
    db: Session = Depends(database.get_db),
):
    collections = db.query(database.CompanyCollection).all()

    return [
        CompanyCollectionMetadata(
            id=collection.id,
            collection_name=collection.collection_name,
        )
        for collection in collections
    ]


@router.get("/{collection_id}", response_model=CompanyCollectionOutput)
def get_company_collection_by_id(
    collection_id: uuid.UUID,
    offset: int = Query(
        0, description="The number of items to skip from the beginning"
    ),
    limit: int = Query(10, description="The number of items to fetch"),
    db: Session = Depends(database.get_db),
):
    base_query = (
        db.query(database.CompanyCollectionAssociation, database.Company)
        .join(database.Company)
        .filter(database.CompanyCollectionAssociation.collection_id == collection_id)
    )

    total_count = base_query.with_entities(func.count()).scalar()

    query = base_query.order_by(database.Company.id.asc())

    results = query.offset(offset).limit(limit).all()
    companies = fetch_companies_with_liked(db, [company.id for _, company in results])

    return CompanyCollectionOutput(
        id=collection_id,
        collection_name=db.query(database.CompanyCollection)
        .get(collection_id)
        .collection_name,
        companies=companies,
        total=total_count,
    )


@router.post(
    "/{target_collection_id}/add-companies", response_model=AddCompaniesResponse
)
def add_companies_to_collection(
    target_collection_id: uuid.UUID,
    request: AddCompaniesRequest,
    db: Session = Depends(database.get_db),
):
    """
    Add companies from one collection to another collection.
    This endpoint handles the database throttling gracefully.
    """
    # Verify target collection exists
    target_collection = db.query(database.CompanyCollection).get(target_collection_id)
    if not target_collection:
        raise HTTPException(status_code=404, detail="Target collection not found")

    # Verify all companies exist
    companies = (
        db.query(database.Company)
        .filter(database.Company.id.in_(request.company_ids))
        .all()
    )

    if len(companies) != len(request.company_ids):
        found_ids = {company.id for company in companies}
        missing_ids = set(request.company_ids) - found_ids
        raise HTTPException(
            status_code=404, detail=f"Companies not found: {list(missing_ids)}"
        )

    # Check for existing associations to avoid duplicates
    existing_associations = (
        db.query(database.CompanyCollectionAssociation)
        .filter(
            database.CompanyCollectionAssociation.collection_id == target_collection_id,
            database.CompanyCollectionAssociation.company_id.in_(request.company_ids),
        )
        .all()
    )

    existing_company_ids = {assoc.company_id for assoc in existing_associations}
    new_company_ids = set(request.company_ids) - existing_company_ids

    if not new_company_ids:
        # All companies already exist in the target collection
        total_count = (
            db.query(database.CompanyCollectionAssociation)
            .filter(
                database.CompanyCollectionAssociation.collection_id
                == target_collection_id
            )
            .count()
        )

        return AddCompaniesResponse(
            message="All companies already exist in the target collection",
            added_count=0,
            total_companies_in_target=total_count,
            progress={
                "total_requested": len(request.company_ids),
                "already_existed": len(request.company_ids),
                "newly_added": 0,
                "completion_percentage": 100,
            },
        )

    # Sort companies by ID for consistent ordering
    sorted_company_ids = sorted(new_company_ids)

    # Process companies one by one for real-time progress
    newly_added = 0
    for i, company_id in enumerate(sorted_company_ids):
        # Check if company already exists (in case it was added by another process)
        existing = (
            db.query(database.CompanyCollectionAssociation)
            .filter(
                database.CompanyCollectionAssociation.collection_id
                == target_collection_id,
                database.CompanyCollectionAssociation.company_id == company_id,
            )
            .first()
        )

        if not existing:
            # Create new association (this will trigger the 10ms throttle)
            new_association = database.CompanyCollectionAssociation(
                company_id=company_id, collection_id=target_collection_id
            )
            db.add(new_association)
            db.commit()
            newly_added += 1

    # Calculate progress info
    progress_info = {
        "total_requested": len(request.company_ids),
        "already_existed": len(existing_company_ids),
        "newly_added": newly_added,
        "completion_percentage": 100,
    }

    # Get updated total count
    total_count = (
        db.query(database.CompanyCollectionAssociation)
        .filter(
            database.CompanyCollectionAssociation.collection_id == target_collection_id
        )
        .count()
    )

    return AddCompaniesResponse(
        message=f"Successfully added {newly_added} companies to {target_collection.collection_name}",
        added_count=newly_added,
        total_companies_in_target=total_count,
        progress=progress_info,
    )


@router.post("/{target_collection_id}/add-companies-stream")
async def add_companies_to_collection_stream(
    target_collection_id: uuid.UUID,
    request: AddCompaniesRequest,
    db: Session = Depends(database.get_db),
):
    """
    Add companies with real-time progress streaming.
    """
    # Verify target collection exists
    target_collection = db.query(database.CompanyCollection).get(target_collection_id)
    if not target_collection:
        raise HTTPException(status_code=404, detail="Target collection not found")

    # Verify all companies exist
    companies = (
        db.query(database.Company)
        .filter(database.Company.id.in_(request.company_ids))
        .all()
    )

    if len(companies) != len(request.company_ids):
        found_ids = {company.id for company in companies}
        missing_ids = set(request.company_ids) - found_ids
        raise HTTPException(
            status_code=404, detail=f"Companies not found: {list(missing_ids)}"
        )

    # Check for existing associations to avoid duplicates
    existing_associations = (
        db.query(database.CompanyCollectionAssociation)
        .filter(
            database.CompanyCollectionAssociation.collection_id == target_collection_id,
            database.CompanyCollectionAssociation.company_id.in_(request.company_ids),
        )
        .all()
    )

    existing_company_ids = {assoc.company_id for assoc in existing_associations}
    new_company_ids = set(request.company_ids) - existing_company_ids

    async def progress_stream():
        if not new_company_ids:
            # All companies already exist
            yield f"data: {json.dumps({'type': 'complete', 'message': 'All companies already exist', 'progress': 100})}\n\n"
            return

        # Sort companies by ID for consistent ordering
        sorted_company_ids = sorted(new_company_ids)

        total_to_process = len(sorted_company_ids)
        processed = 0
        newly_added = 0

        # Send initial progress
        yield f"data: {json.dumps({'type': 'start', 'total': total_to_process, 'processed': 0, 'progress': 0})}\n\n"

        for company_id in sorted_company_ids:
            try:
                # Check if company already exists
                existing = (
                    db.query(database.CompanyCollectionAssociation)
                    .filter(
                        database.CompanyCollectionAssociation.collection_id
                        == target_collection_id,
                        database.CompanyCollectionAssociation.company_id == company_id,
                    )
                    .first()
                )

                if not existing:
                    # Create new association (this will trigger the 10ms throttle)
                    new_association = database.CompanyCollectionAssociation(
                        company_id=company_id, collection_id=target_collection_id
                    )
                    db.add(new_association)
                    db.commit()
                    newly_added += 1

                processed += 1
                progress = int((processed / total_to_process) * 100)

                # Send progress update
                yield f"data: {json.dumps({'type': 'progress', 'processed': processed, 'total': total_to_process, 'progress': progress, 'newly_added': newly_added})}\n\n"

                # Small delay to make progress visible
                await asyncio.sleep(0.001)

            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                return

        # Send completion
        yield f"data: {json.dumps({'type': 'complete', 'message': f'Successfully added {newly_added} companies', 'total_processed': processed, 'newly_added': newly_added, 'progress': 100})}\n\n"

    return StreamingResponse(
        progress_stream(),
        media_type="text/plain",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.get("/{collection_id}/company-ids", response_model=CollectionCompanyIdsResponse)
def get_collection_company_ids(
    collection_id: uuid.UUID,
    db: Session = Depends(database.get_db),
):
    """
    Get all company IDs in a collection for bulk operations.
    """
    # Verify collection exists
    collection = db.query(database.CompanyCollection).get(collection_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    # Get all company IDs in the collection, sorted by company ID
    associations = (
        db.query(database.CompanyCollectionAssociation)
        .join(database.Company)
        .filter(database.CompanyCollectionAssociation.collection_id == collection_id)
        .order_by(database.Company.id.asc())
        .all()
    )

    company_ids = [assoc.company_id for assoc in associations]

    return CollectionCompanyIdsResponse(
        company_ids=company_ids, total_count=len(company_ids)
    )


@router.post("/{collection_id}/toggle-company/{company_id}")
def toggle_company_in_collection(
    collection_id: uuid.UUID,
    company_id: int,
    db: Session = Depends(database.get_db),
):
    """
    Toggle a company's presence in a collection (add if not present, remove if present).
    """
    # Verify collection exists
    collection = db.query(database.CompanyCollection).get(collection_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    # Verify company exists
    company = db.query(database.Company).get(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Check if company is already in collection
    existing_association = (
        db.query(database.CompanyCollectionAssociation)
        .filter(
            database.CompanyCollectionAssociation.collection_id == collection_id,
            database.CompanyCollectionAssociation.company_id == company_id,
        )
        .first()
    )

    if existing_association:
        # Remove from collection
        db.delete(existing_association)
        action = "removed from"
    else:
        # Add to collection
        new_association = database.CompanyCollectionAssociation(
            company_id=company_id, collection_id=collection_id
        )
        db.add(new_association)
        action = "added to"

    db.commit()

    return {
        "message": f"Company {company.company_name} {action} {collection.collection_name}",
        "is_in_collection": not existing_association,
    }
