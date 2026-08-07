from typing import AsyncGenerator

import pytest_asyncio

from tiktok_captcha import PrivateAPIServiceLocation, TikTokCaptchaSolver

from .settings import PRIVATE_API_KEY, PRIVATE_API_URL


@pytest_asyncio.fixture(scope="session")
async def solver() -> AsyncGenerator[TikTokCaptchaSolver, None]:
    yield TikTokCaptchaSolver(
        service_location=PrivateAPIServiceLocation(
            url=PRIVATE_API_URL,
            api_key=PRIVATE_API_KEY,
        ),
    )
