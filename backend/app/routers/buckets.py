"""CRUD endpoints for buckets."""
from fastapi import APIRouter, HTTPException

from app.database import supabase
from app.models.bucket import Bucket, BucketCreate, BucketUpdate

router = APIRouter(prefix="/api/buckets", tags=["buckets"])

TABLE = "buckets"


@router.get("", response_model=list[Bucket])
def list_buckets():
    result = supabase.table(TABLE).select("*").order("created_at").execute()
    return result.data


@router.post("", response_model=Bucket, status_code=201)
def create_bucket(payload: BucketCreate):
    result = supabase.table(TABLE).insert(payload.model_dump(mode="json")).execute()
    return result.data[0]


@router.get("/{bucket_id}", response_model=Bucket)
def get_bucket(bucket_id: str):
    result = supabase.table(TABLE).select("*").eq("id", bucket_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Bucket not found")
    return result.data[0]


@router.put("/{bucket_id}", response_model=Bucket)
def update_bucket(bucket_id: str, payload: BucketUpdate):
    changes = payload.model_dump(mode="json", exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = supabase.table(TABLE).update(changes).eq("id", bucket_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Bucket not found")
    return result.data[0]


@router.delete("/{bucket_id}", status_code=204)
def delete_bucket(bucket_id: str):
    result = supabase.table(TABLE).delete().eq("id", bucket_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Bucket not found")
    return None
