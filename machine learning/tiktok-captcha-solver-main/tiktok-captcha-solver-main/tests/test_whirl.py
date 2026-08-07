import aiofiles
import pytest

from tiktok_captcha.exceptions import InvalidImageException
from tiktok_captcha.solver import TikTokCaptchaSolver


def _get_expected_drag_distance(rotation_angle: float, drag_width: int) -> int:
    return int(rotation_angle * drag_width / 360)


async def test_whirl_captcha_solved(solver: TikTokCaptchaSolver):
    async with aiofiles.open("tests/assets/whirl-inner.jpg", "rb") as f:
        inner = await f.read()

    async with aiofiles.open("tests/assets/whirl-outer.jpg", "rb") as f:
        outer = await f.read()

    drag_width = 348
    solution = await solver.solve_whirl(
        raw_inner=inner,
        raw_outer=outer,
        drag_width=drag_width,
    )

    expected_rotation_angle_range = (235, 237)
    expected_drag_distance_range = (
        _get_expected_drag_distance(expected_rotation_angle_range[0], drag_width),
        _get_expected_drag_distance(expected_rotation_angle_range[1], drag_width),
    )
    assert (
        expected_rotation_angle_range[0]
        <= solution.rotation_angle
        <= expected_rotation_angle_range[1]
    )
    assert (
        expected_drag_distance_range[0] <= solution.drag_distance <= expected_drag_distance_range[1]
    )


async def test_whirl_captcha_invalid_image(solver: TikTokCaptchaSolver):
    with pytest.raises(InvalidImageException):
        await solver.solve_whirl(b"", b"")
