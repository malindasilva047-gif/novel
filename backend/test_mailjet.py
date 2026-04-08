#!/usr/bin/env python3
"""
Quick test script to verify Mailjet configuration
Run: python test_mailjet.py
"""
import sys
from app.core.config import get_settings
from app.services.email import check_mailjet_connection

def main():
    print("=" * 60)
    print("MAILJET CONFIGURATION TEST")
    print("=" * 60)
    
    settings = get_settings()
    
    print("\n📋 Configuration Status:")
    print(f"   ✓ API Key configured: {bool(settings.mailjet_api_key)}")
    print(f"   ✓ Secret Key configured: {bool(settings.mailjet_secret_key)}")
    print(f"   ✓ From Email: {settings.mailjet_from_email}")
    print(f"   ✓ From Name: {settings.mailjet_from_name}")
    
    if not (settings.mailjet_api_key and settings.mailjet_secret_key):
        print("\n❌ ERROR: Mailjet credentials not configured in .env file")
        return False
    
    print("\n🔗 Testing Mailjet Connection...")
    is_connected, error = check_mailjet_connection()
    
    if is_connected:
        print("   ✅ CONNECTION SUCCESSFUL!")
        print("\n✨ Your Mailjet setup is ready to use!")
        return True
    else:
        print(f"   ❌ CONNECTION FAILED: {error}")
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
