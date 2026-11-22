from pydantic import BaseModel, EmailStr, Field


class UserSignup(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    email: EmailStr
    password: str = Field(min_length=8)


class UserLogin(BaseModel):
    identifier: str = Field(min_length=3, max_length=120)
    password: str


class GoogleAuthRequest(BaseModel):
    credential: str = Field(min_length=20)


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    token: str
    new_password: str = Field(min_length=8)


class UserSignupResponse(BaseModel):
    message: str
    verification_token: str
    auto_verified: bool = False


class ActionMessageResponse(BaseModel):
    message: str


class ForgotPasswordResponse(BaseModel):
    message: str
    reset_token: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    onboarding_status: str = "pending_profile"
    onboarding_required: bool = True


class GoogleAuthResponse(TokenResponse):
    is_new_user: bool = False
