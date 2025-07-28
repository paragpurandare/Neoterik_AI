from supabase import create_client, Client
import os
import jwt
from jwt import PyJWKClient
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from dotenv import load_dotenv

from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
load_dotenv()
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")  # Use service key for server-side
SUPABASE_JWT_SECRET = "4cU5FgYM2rqyWPh1+K9MBcgbyQ4sbx8aF9qHmVpoWh+WXrnwhXNCQmie5/tHgoeQPQkRUPpCZlPIvshBGtA5Wg=="  # Add this to your .env

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Security scheme for JWT
security = HTTPBearer()

async def verify_jwt_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    token = credentials.credentials
    print(f"🔐 JWT Token verification started for token: {token[:20]}…")

    try:
        header = jwt.get_unverified_header(token)
    except jwt.DecodeError as e:
        print(f"❌ JWT Token verification failed: {e}")
        raise HTTPException(401, "Invalid token")

    alg = header.get("alg")

    if alg == "RS256":
        # ---- Google ID Token verification ----
        try:
            id_info = google_id_token.verify_oauth2_token(
                token,
                google_requests.Request(),
                "394042316648-k1jjdti24gso3docgh4sc3apiepgh90f.apps.googleusercontent.com"
            )
            user_id = id_info.get("sub")
            if not user_id:
                raise ValueError("Missing sub in Google token")
            print(f"✅ Google ID token valid for user_id: {user_id}")
            return {"user_id": user_id, "payload": id_info}
        except ValueError as e:
            print(f"❌ Google ID token verification failed: {e}")
            raise HTTPException(401, "Invalid Google ID token")

    # ---- otherwise treat as your own HS256‐signed token ----
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(401, "Invalid token: missing user ID")
        print(f"✅ Supabase JWT valid for user_id: {user_id}")
        return {"user_id": user_id, "payload": payload}
    except jwt.ExpiredSignatureError:
        print("❌ JWT Token verification failed: token has expired")
        raise HTTPException(401, "Token has expired")
    except jwt.InvalidTokenError as e:
        print(f"❌ JWT Token verification failed: {e}")
        raise HTTPException(401, "Invalid token")


async def get_current_user(token_data: dict = Depends(verify_jwt_token)):
    """Get current user from verified token"""
    user_id = token_data["user_id"]
    
    try:
        # Fetch user from Supabase
        result = supabase.table("users").select("*").eq("id", user_id).maybe_single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch user: {str(e)}")