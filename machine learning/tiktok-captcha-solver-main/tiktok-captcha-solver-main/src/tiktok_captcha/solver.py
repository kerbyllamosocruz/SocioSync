import json
from base64 import b64encode
from typing import Literal

from aiohttp import ClientSession
from typing_extensions import assert_never

from .exceptions import (
    FailedToSolveCaptchaException,
    FailedToVerifyCaptchaException,
    InvalidImageException,
    InvalidProxyException,
    ProxyTimeoutException,
    UnexpectedResponseException,
)
from .schemas import (
    HashcashSolution,
    PuzzleSolution,
    SameObjectSolution,
    ServiceLocation,
    WhirlSolution,
)


class TikTokCaptchaSolver:
    def __init__(self, service_location: ServiceLocation) -> None:
        self._service_location = service_location

    def _get_session(self) -> ClientSession:
        if self._service_location.type == "rapid_api":
            return ClientSession(
                base_url=self._service_location.url,
                headers={
                    "x-rapidapi-key": self._service_location.rapid_api_key,
                    "x-rapidapi-host": "tiktok-captcha-solver12.p.rapidapi.com",
                    "Content-Type": "application/json",
                },
            )
        elif self._service_location.type == "private_api":
            return ClientSession(
                base_url=self._service_location.url,
                headers={
                    "x-api-key": self._service_location.api_key,
                    "Content-Type": "application/json",
                },
            )
        else:
            assert_never(self._service_location.type)

    async def solve_puzzle(
        self,
        raw_puzzle: bytes,
        raw_background: bytes,
        drag_width: int = 348,
    ) -> PuzzleSolution:
        """Solve puzzle (slide) captcha

        Args:
            raw_puzzle: byte-like puzzle image
            raw_background: byte-like background image
            drag_width: Width of the draggable element in pixels

        Returns:
            PuzzleSolution: Solution to the puzzle captcha
        """

        if not raw_puzzle or not raw_background:
            raise InvalidImageException("Puzzle or background image must not be empty")

        async with self._get_session() as session:
            async with session.post(
                "puzzle",
                json={
                    "puzzle_image_base64": b64encode(raw_puzzle).decode(),
                    "background_image_base64": b64encode(raw_background).decode(),
                    "drag_width": drag_width,
                },
            ) as response:
                text = await response.text()
                data = json.loads(text)

        if data["status"] == "success":
            return PuzzleSolution.model_validate(data["data"])
        elif data["status"] == "error":
            if data["error_code"] == "failed_to_solve_captcha":
                raise FailedToSolveCaptchaException(data["error_message"])

        raise UnexpectedResponseException(text)

    async def solve_whirl(
        self,
        raw_inner: bytes,
        raw_outer: bytes,
        drag_width: int = 348,
    ) -> WhirlSolution:
        """Solve rotate (whirl) captcha.

        Args:
            raw_inner: byte-like inner image
            raw_outer: byte-like outer image
            drag_width: Width of the draggable element in pixels

        Returns:
            WhirlSolution: Solution to the whirl captcha
        """

        if not raw_inner or not raw_outer:
            raise InvalidImageException("Inner or outer image must not be empty")

        async with self._get_session() as session:
            async with session.post(
                "rotate",
                json={
                    "inner_image_base64": b64encode(raw_inner).decode(),
                    "outer_image_base64": b64encode(raw_outer).decode(),
                    "drag_width": drag_width,
                },
            ) as response:
                text = await response.text()
                data = json.loads(text)

        if data["status"] == "success":
            return WhirlSolution.model_validate(data["data"])
        elif data["status"] == "error":
            if data["error_code"] == "failed_to_solve_captcha":
                raise FailedToSolveCaptchaException(data["error_message"])

        raise UnexpectedResponseException(text)

    async def solve_3d(
        self,
        raw_image: bytes,
        modified_img_width: int = 348,
    ) -> SameObjectSolution:
        """Solve 3D object matching captcha.

        Args:
            raw_image: byte-like puzzle image
            modified_img_width: Width of the image after browser scaling.

        Returns:
            SameObjectSolution: coordinates of matching points.
        """

        if not raw_image:
            raise InvalidImageException("Image must not be empty")

        async with self._get_session() as session:
            async with session.post(
                "3d",
                json={
                    "image_base64": b64encode(raw_image).decode(),
                    "modified_img_width": modified_img_width,
                },
            ) as response:
                text = await response.text()
                data = json.loads(text)

        if data["status"] == "success":
            return SameObjectSolution.model_validate(data["data"])
        elif data["status"] == "error":
            if data["error_code"] == "failed_to_solve_captcha":
                raise FailedToSolveCaptchaException(data["error_message"])

        raise UnexpectedResponseException(text)

    async def solve_hashcash(
        self,
        prefix: str,
        required_bits: int,
        stamp: int,
    ) -> HashcashSolution:
        """Solve hashcash captcha.

        Args:
            prefix: hashcash question prefix returned by TikTok.
            required_bits: number of leading bits that must match.
            stamp: hashcash question stamp returned by TikTok.

        Returns:
            HashcashSolution: Solution to the hashcash captcha.
        """

        async with self._get_session() as session:
            async with session.post(
                "hashcash",
                json={
                    "prefix": prefix,
                    "required_bits": required_bits,
                    "stamp": stamp,
                },
            ) as response:
                text = await response.text()
                data = json.loads(text)

        if data["status"] == "success":
            return HashcashSolution.model_validate(data["data"])
        elif data["status"] == "error":
            if data["error_code"] == "failed_to_solve_captcha":
                raise FailedToSolveCaptchaException(data["error_message"])

        raise UnexpectedResponseException(text)

    async def verify(
        self,
        *,
        subtype: Literal["slide", "whirl", "3d", "hashcash"],
        device_id: str,
        iid: str,
        verify_fp: str,
        region: Literal["mya", "va", "sg", "in", "ie", "ttp", "ttp2", "no1a", "useastred"],
        detail: str,
        server_sdk_env: str,
        ms_token: str,
        proxy: str,
    ) -> None:
        """Verify captcha solution with TikTok backend.

        Parameters mirror the official API request body. All arguments are mandatory
        and forwarded unchanged.
        """

        payload = {
            "subtype": subtype,
            "device_id": device_id,
            "iid": iid,
            "verify_fp": verify_fp,
            "region": region,
            "detail": detail,
            "server_sdk_env": server_sdk_env,
            "ms_token": ms_token,
            "proxy": proxy,
        }

        async with self._get_session() as session:
            async with session.post("verify", json=payload) as response:
                text = await response.text()
                data = json.loads(text)

        if data["status"] == "success":
            return
        elif data["status"] == "error":
            if data.get("error_code") == "failed_to_solve_captcha":
                raise FailedToSolveCaptchaException(data["error_message"])
            elif data.get("error_code") == "failed_to_verify_captcha":
                raise FailedToVerifyCaptchaException(data["error_message"])
            elif data.get("error_code") == "invalid_proxy":
                raise InvalidProxyException(data["error_message"])
            elif data.get("error_code") == "proxy_timeout":
                raise ProxyTimeoutException(data["error_message"])

        raise UnexpectedResponseException(text)
