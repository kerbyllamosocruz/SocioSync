import aiofiles
import pytest

from tiktok_captcha.exceptions import InvalidImageException
from tiktok_captcha.solver import TikTokCaptchaSolver


async def test_puzzle_captcha_solved(solver: TikTokCaptchaSolver):
    async with aiofiles.open("tests/assets/puzzle-piece.webp", "rb") as f:
        puzzle = await f.read()

    async with aiofiles.open("tests/assets/puzzle-background.webp", "rb") as f:
        background = await f.read()

    drag_width = 348
    solution = await solver.solve_puzzle(
        raw_puzzle=puzzle,
        raw_background=background,
        drag_width=drag_width,
    )
    assert 270 <= solution.drag_distance <= 272


async def test_puzzle_captcha_invalid_image(solver: TikTokCaptchaSolver):
    with pytest.raises(InvalidImageException):
        await solver.solve_puzzle(b"", b"")
