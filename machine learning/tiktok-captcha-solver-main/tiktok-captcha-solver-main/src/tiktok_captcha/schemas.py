from typing import Literal, Union

from pydantic import BaseModel


class PuzzleSolution(BaseModel):
    drag_distance: int


class WhirlSolution(BaseModel):
    drag_distance: int
    rotation_angle: float


class SameObjectSolution(BaseModel):
    x1: int
    y1: float
    x2: int
    y2: float


class HashcashSolution(BaseModel):
    answer: str


class RapidAPIServiceLocation(BaseModel):
    type: Literal["rapid_api"] = "rapid_api"
    url: str = "https://tiktok-captcha-solver12.p.rapidapi.com/captcha/"
    rapid_api_key: str


class PrivateAPIServiceLocation(BaseModel):
    type: Literal["private_api"] = "private_api"
    url: str
    api_key: str


ServiceLocation = Union[RapidAPIServiceLocation | PrivateAPIServiceLocation]
