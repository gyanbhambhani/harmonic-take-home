import uuid
from typing import List

from fastapi import APIRouter, Depends, Query, HTTPException
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
    query = (
        db.query(database.CompanyCollectionAssociation, database.Company)
        .join(database.Company)
        .filter(database.CompanyCollectionAssociation.collection_id == collection_id)
    )

    total_count = query.with_entities(func.count()).scalar()

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


@router.post("/{target_collection_id}/add-companies", response_model=AddCompaniesResponse)
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
    companies = db.query(database.Company).filter(
        database.Company.id.in_(request.company_ids)
    ).all()
    
    if len(companies) != len(request.company_ids):
        found_ids = {company.id for company in companies}
        missing_ids = set(request.company_ids) - found_ids
        raise HTTPException(
            status_code=404, 
            detail=f"Companies not found: {list(missing_ids)}"
        )
    
    # Check for existing associations to avoid duplicates
    existing_associations = db.query(database.CompanyCollectionAssociation).filter(
        database.CompanyCollectionAssociation.collection_id == target_collection_id,
        database.CompanyCollectionAssociation.company_id.in_(request.company_ids)
    ).all()
    
    existing_company_ids = {assoc.company_id for assoc in existing_associations}
    new_company_ids = set(request.company_ids) - existing_company_ids
    
    if not new_company_ids:
        # All companies already exist in the target collection
        total_count = db.query(database.CompanyCollectionAssociation).filter(
            database.CompanyCollectionAssociation.collection_id == target_collection_id
        ).count()
        
        return AddCompaniesResponse(
            message="All companies already exist in the target collection",
            added_count=0,
            total_companies_in_target=total_count
        )
    
    # Create new associations (this will trigger the 100ms throttle for each insert)
    new_associations = [
        database.CompanyCollectionAssociation(
            company_id=company_id,
            collection_id=target_collection_id
        )
        for company_id in new_company_ids
    ]
    
    db.bulk_save_objects(new_associations)
    db.commit()
    
    # Get updated total count
    total_count = db.query(database.CompanyCollectionAssociation).filter(
        database.CompanyCollectionAssociation.collection_id == target_collection_id
    ).count()
    
    return AddCompaniesResponse(
        message=f"Successfully added {len(new_company_ids)} companies to {target_collection.collection_name}",
        added_count=len(new_company_ids),
        total_companies_in_target=total_count
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
    
    # Get all company IDs in the collection
    associations = db.query(database.CompanyCollectionAssociation).filter(
        database.CompanyCollectionAssociation.collection_id == collection_id
    ).all()
    
    company_ids = [assoc.company_id for assoc in associations]
    
    return CollectionCompanyIdsResponse(
        company_ids=company_ids,
        total_count=len(company_ids)
    )
