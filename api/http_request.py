import requests
import base64

# 1. Your Reveal REST Integration credentials (from the Marketplace email)
username = "your_integration_username"
password = "your_integration_password"

# 2. Base64 encode the string "username:password"
credentials_str = f"{username}:{password}"
base64_encoded = base64.b64encode(credentials_str.encode("utf-8")).decode("utf-8")

# 3. Configure the authentication request
url = "https://fim.api.us.fleetmatics.com/token"
headers = {
    "Authorization": f"Basic {base64_encoded}",
    "Accept": "application/json"
}

# 4. Execute the call and extract the Bearer Token
response = requests.get(url, headers=headers)

if response.status_code == 200:
    token_data = response.json()
    # The JSON key name might vary slightly depending on the response scheme (e.g., 'token' or 'access_token')
    bearer_token = token_data.get("token") 
    print(f"Your 20-minute temporary token is:\n{bearer_token}")
else:
    print(f"Failed to get token. Status code: {response.status_code}")
    print(response.text)
