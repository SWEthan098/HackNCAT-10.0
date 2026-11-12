import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()  # reads api/.env locally; Railway injects env vars directly

from fastapi import Depends, FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from supabase import Client, create_client  # noqa: E402

from auth import current_user  # noqa: E402

app = FastAPI(title="api")

origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@lru_cache
def supabase_admin() -> Client:
    """Service-role client. Bypasses RLS, so only use it server-side and scope queries yourself."""
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/me")
def me(user: dict = Depends(current_user)):
    profile = None
    try:
        res = supabase_admin().table("profiles").select("*").eq("id", user["sub"]).maybe_single().execute()
        profile = res.data if res else None
    except Exception as e:  # missing env or migration not run yet; auth still worked
        profile = {"error": str(e)}
    return {"id": user["sub"], "email": user.get("email"), "role": user.get("role"), "profile": profile}
