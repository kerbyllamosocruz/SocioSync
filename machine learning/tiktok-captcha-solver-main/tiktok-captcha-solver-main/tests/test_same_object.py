import aiofiles
import pytest

from tiktok_captcha.exceptions import InvalidImageException
from tiktok_captcha.solver import TikTokCaptchaSolver


async def test_same_object_captcha_solved(solver: TikTokCaptchaSolver):
    async with aiofiles.open("tests/assets/3d-image.jpg", "rb") as f:
        img = await f.read()

    modified_img_width = 348
    solution = await solver.solve_3d(
        raw_image=img,
        modified_img_width=modified_img_width,
    )

    assert 136 <= solution.x1 <= 140
    assert 58 <= solution.y1 <= 62
    assert 224 <= solution.x2 <= 228
    assert 174 <= solution.y2 <= 178


async def test_same_object_captcha_invalid_image(solver: TikTokCaptchaSolver):
    with pytest.raises(InvalidImageException):
        await solver.solve_3d(b"")
