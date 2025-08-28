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


@router.post("/like-companies")
def like_companies_bulk(
    request: AddCompaniesRequest,
    db: Session = Depends(database.get_db),
):
    """
    Like multiple companies (only if they are currently unliked).
    """
    # Get collection IDs
    my_list_collection = (
        db.query(database.CompanyCollection)
        .filter_by(collection_name="My List")
        .first()
    )
    liked_collection = (
        db.query(database.CompanyCollection)
        .filter_by(collection_name="Liked Companies List")
        .first()
    )

    if not my_list_collection or not liked_collection:
        raise HTTPException(status_code=404, detail="Required collections not found")

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

    # Check current liked status for each company
    liked_associations = (
        db.query(database.CompanyCollectionAssociation)
        .filter(
            database.CompanyCollectionAssociation.collection_id == liked_collection.id,
            database.CompanyCollectionAssociation.company_id.in_(request.company_ids),
        )
        .all()
    )

    currently_liked_ids = {assoc.company_id for assoc in liked_associations}

    # Only like companies that are currently unliked
    companies_to_like = set(request.company_ids) - currently_liked_ids
    already_liked_count = len(currently_liked_ids & set(request.company_ids))

    newly_liked = 0

    # Process companies to like
    for company_id in sorted(companies_to_like):
        new_association = database.CompanyCollectionAssociation(
            company_id=company_id, collection_id=liked_collection.id
        )
        db.add(new_association)
        newly_liked += 1

    db.commit()

    total_liked = (
        db.query(database.CompanyCollectionAssociation)
        .filter(
            database.CompanyCollectionAssociation.collection_id == liked_collection.id
        )
        .count()
    )

    return {
        "message": f"Successfully liked {newly_liked} companies ({already_liked_count} were already liked)",
        "newly_liked": newly_liked,
        "already_liked": already_liked_count,
        "total_liked": total_liked,
        "progress": {
            "total_requested": len(request.company_ids),
            "newly_liked": newly_liked,
            "already_liked": already_liked_count,
            "completion_percentage": 100,
        },
    }


@router.post("/like-companies-stream")
async def like_companies_stream(
    request: AddCompaniesRequest,
    db: Session = Depends(database.get_db),
):
    """
    Like multiple companies with real-time progress streaming.
    """
    # Get collection IDs
    my_list_collection = (
        db.query(database.CompanyCollection)
        .filter_by(collection_name="My List")
        .first()
    )
    liked_collection = (
        db.query(database.CompanyCollection)
        .filter_by(collection_name="Liked Companies List")
        .first()
    )

    if not my_list_collection or not liked_collection:
        raise HTTPException(status_code=404, detail="Required collections not found")

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

    # Check current liked status for each company
    liked_associations = (
        db.query(database.CompanyCollectionAssociation)
        .filter(
            database.CompanyCollectionAssociation.collection_id == liked_collection.id,
            database.CompanyCollectionAssociation.company_id.in_(request.company_ids),
        )
        .all()
    )

    currently_liked_ids = {assoc.company_id for assoc in liked_associations}

    # Only like companies that are currently unliked
    companies_to_like = set(request.company_ids) - currently_liked_ids
    already_liked_count = len(currently_liked_ids & set(request.company_ids))

    async def progress_stream():
        if not companies_to_like:
            # All companies already liked
            yield f"data: {json.dumps({'type': 'complete', 'message': f'All companies already liked ({already_liked_count} companies)', 'newly_liked': 0, 'already_liked': already_liked_count, 'progress': 100})}\n\n"
            return

        # Sort companies by ID for consistent ordering
        sorted_company_ids = sorted(companies_to_like)
        total_to_process = len(sorted_company_ids)
        processed = 0
        newly_liked = 0

        # Send initial progress
        yield f"data: {json.dumps({'type': 'start', 'total': total_to_process, 'processed': 0, 'progress': 0, 'operation': 'like'})}\n\n"

        for company_id in sorted_company_ids:
            try:
                # Get company name for progress display
                company = db.query(database.Company).get(company_id)
                company_name = (
                    company.company_name if company else f"Company {company_id}"
                )

                # Check if company already exists (in case it was added by another process)
                existing = (
                    db.query(database.CompanyCollectionAssociation)
                    .filter(
                        database.CompanyCollectionAssociation.collection_id
                        == liked_collection.id,
                        database.CompanyCollectionAssociation.company_id == company_id,
                    )
                    .first()
                )

                if not existing:
                    # Create new association (this will trigger the 1ms throttle)
                    new_association = database.CompanyCollectionAssociation(
                        company_id=company_id, collection_id=liked_collection.id
                    )
                    db.add(new_association)
                    db.commit()
                    newly_liked += 1

                processed += 1
                progress = int((processed / total_to_process) * 100)

                # Send progress update
                yield f"data: {json.dumps({'type': 'progress', 'processed': processed, 'total': total_to_process, 'progress': progress, 'newly_liked': newly_liked, 'current_company': company_name, 'company_id': company_id})}\n\n"

                # Small delay to make progress visible
                await asyncio.sleep(0.001)

            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                return

        # Send completion
        yield f"data: {json.dumps({'type': 'complete', 'message': f'Successfully liked {newly_liked} companies ({already_liked_count} were already liked)', 'total_processed': processed, 'newly_liked': newly_liked, 'already_liked': already_liked_count, 'progress': 100})}\n\n"

    return StreamingResponse(
        progress_stream(),
        media_type="text/plain",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.post("/unlike-companies")
def unlike_companies_bulk(
    request: AddCompaniesRequest,
    db: Session = Depends(database.get_db),
):
    """
    Unlike multiple companies (only if they are currently liked).
    """
    # Get collection IDs
    my_list_collection = (
        db.query(database.CompanyCollection)
        .filter_by(collection_name="My List")
        .first()
    )
    liked_collection = (
        db.query(database.CompanyCollection)
        .filter_by(collection_name="Liked Companies List")
        .first()
    )

    if not my_list_collection or not liked_collection:
        raise HTTPException(status_code=404, detail="Required collections not found")

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

    # Check current liked status for each company
    liked_associations = (
        db.query(database.CompanyCollectionAssociation)
        .filter(
            database.CompanyCollectionAssociation.collection_id == liked_collection.id,
            database.CompanyCollectionAssociation.company_id.in_(request.company_ids),
        )
        .all()
    )

    currently_liked_ids = {assoc.company_id for assoc in liked_associations}

    # Only unlike companies that are currently liked
    companies_to_unlike = currently_liked_ids & set(request.company_ids)
    already_unliked_count = len(set(request.company_ids) - currently_liked_ids)

    newly_unliked = 0

    # Process companies to unlike
    for company_id in sorted(companies_to_unlike):
        existing_association = (
            db.query(database.CompanyCollectionAssociation)
            .filter(
                database.CompanyCollectionAssociation.collection_id
                == liked_collection.id,
                database.CompanyCollectionAssociation.company_id == company_id,
            )
            .first()
        )
        if existing_association:
            db.delete(existing_association)
            newly_unliked += 1

    db.commit()

    total_liked = (
        db.query(database.CompanyCollectionAssociation)
        .filter(
            database.CompanyCollectionAssociation.collection_id == liked_collection.id
        )
        .count()
    )

    return {
        "message": f"Successfully unliked {newly_unliked} companies ({already_unliked_count} were already unliked)",
        "newly_unliked": newly_unliked,
        "already_unliked": already_unliked_count,
        "total_liked": total_liked,
        "progress": {
            "total_requested": len(request.company_ids),
            "newly_unliked": newly_unliked,
            "already_unliked": already_unliked_count,
            "completion_percentage": 100,
        },
    }


@router.post("/unlike-companies-stream")
async def unlike_companies_stream(
    request: AddCompaniesRequest,
    db: Session = Depends(database.get_db),
):
    """
    Unlike multiple companies with real-time progress streaming.
    """
    # Get collection IDs
    my_list_collection = (
        db.query(database.CompanyCollection)
        .filter_by(collection_name="My List")
        .first()
    )
    liked_collection = (
        db.query(database.CompanyCollection)
        .filter_by(collection_name="Liked Companies List")
        .first()
    )

    if not my_list_collection or not liked_collection:
        raise HTTPException(status_code=404, detail="Required collections not found")

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

    # Check current liked status for each company
    liked_associations = (
        db.query(database.CompanyCollectionAssociation)
        .filter(
            database.CompanyCollectionAssociation.collection_id == liked_collection.id,
            database.CompanyCollectionAssociation.company_id.in_(request.company_ids),
        )
        .all()
    )

    currently_liked_ids = {assoc.company_id for assoc in liked_associations}

    # Only unlike companies that are currently liked
    companies_to_unlike = currently_liked_ids & set(request.company_ids)
    already_unliked_count = len(set(request.company_ids) - currently_liked_ids)

    async def progress_stream():
        if not companies_to_unlike:
            # All companies already unliked
            yield f"data: {json.dumps({'type': 'complete', 'message': f'All companies already unliked ({already_unliked_count} companies)', 'newly_unliked': 0, 'already_unliked': already_unliked_count, 'progress': 100})}\n\n"
            return

        # Sort companies by ID for consistent ordering
        sorted_company_ids = sorted(companies_to_unlike)
        total_to_process = len(sorted_company_ids)
        processed = 0
        newly_unliked = 0

        # Send initial progress
        yield f"data: {json.dumps({'type': 'start', 'total': total_to_process, 'processed': 0, 'progress': 0, 'operation': 'unlike'})}\n\n"

        for company_id in sorted_company_ids:
            try:
                # Get company name for progress display
                company = db.query(database.Company).get(company_id)
                company_name = (
                    company.company_name if company else f"Company {company_id}"
                )

                # Remove from liked collection
                existing_association = (
                    db.query(database.CompanyCollectionAssociation)
                    .filter(
                        database.CompanyCollectionAssociation.collection_id
                        == liked_collection.id,
                        database.CompanyCollectionAssociation.company_id == company_id,
                    )
                    .first()
                )

                if existing_association:
                    db.delete(existing_association)
                    db.commit()
                    newly_unliked += 1

                processed += 1
                progress = int((processed / total_to_process) * 100)

                # Send progress update
                yield f"data: {json.dumps({'type': 'progress', 'processed': processed, 'total': total_to_process, 'progress': progress, 'newly_unliked': newly_unliked, 'current_company': company_name, 'company_id': company_id})}\n\n"

                # Small delay to make progress visible
                await asyncio.sleep(0.001)

            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                return

        # Send completion
        yield f"data: {json.dumps({'type': 'complete', 'message': f'Successfully unliked {newly_unliked} companies ({already_unliked_count} were already unliked)', 'total_processed': processed, 'newly_unliked': newly_unliked, 'already_unliked': already_unliked_count, 'progress': 100})}\n\n"

    return StreamingResponse(
        progress_stream(),
        media_type="text/plain",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
