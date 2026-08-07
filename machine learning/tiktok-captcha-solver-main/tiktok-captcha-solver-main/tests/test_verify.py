import random
import string
import time

from tiktok_captcha.solver import TikTokCaptchaSolver

from .settings import PROXY

CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
T = len(CHARS)


def _now_ms() -> int:
    return time.time_ns() // 1_000_000


def _base36(n: int) -> str:
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    s = ""
    while n:
        n, rem = divmod(n, 36)
        s = digits[rem] + s
    return s or "0"


def generate_verify_fp() -> str:
    r = _base36(_now_ms())

    o = [""] * 36
    for idx in (8, 13, 18, 23):
        o[idx] = "_"
    o[14] = "4"

    for i in range(36):
        if not o[i]:
            n = int(random.random() * T)
            if i == 19:
                n = (n & 3) | 8
            o[i] = CHARS[n]

    return f"verify_{r}_" + "".join(o)


async def test_verify_success(solver: TikTokCaptchaSolver):
    result = await solver.verify(
        subtype="3d",
        device_id=f"754{''.join(random.choices(string.digits, k=16))}",
        iid="0",
        verify_fp=generate_verify_fp(),
        region="no1a",
        detail="l2uF9tjRXulja4sQC05*D8yBqyrp*eRr*-uqAgt7z8xlrsXKqIVLLiWZwGV64jmslIvcOPAU4JKNbZMsUJRIaUnijEggW8mTVlXY2RwTdjOCBr4za7YfTv*DiCcwGQtFKCOyQSOzy-76U346Dio0dGMkR7xOMRh325M8HaBjrD70HvJYyMVBBVFvmqK6ZtyuYIvcVRmSTgILRAKfcz9rNC1l9Q1AgN20VxbvCnWfP-dosVsIKCZh4CdKsiMAzWKvxYu0rSyCljqeVVjJ1*Z1285q3UO3xGsXJFR6l9kA4XPo*wUrO0SvRBiHhDF*7jCH*JlJe*4W0qKpTzKnHQRFeHZP3M6Pd-87ENAMmBWRbrJ*RcSoSXCtPBHivJHpHa2OTR5uQhTbQV9gGOwUwPGQHKq2ZzCVM-hL4gslyrjwlvIMoCJD4xs.",
        server_sdk_env='{"idc":"my","region":"ALISG","server_type":"passport"}',
        ms_token="PGvFJUZMmE1v3MQ_WMpH-0K7bBTXeL0-irnmjjS8gBC7mea5HnotpBefv0Nb_WlII8XQMRG6plihRpdodDU5mq4RN7q4FQ5XnR3d2MDKHW_sZfIp7-utleWMnMKu2q9zrQBwEkFrYRlBOMBDb7Zu_lU=",
        proxy=PROXY,
    )
    assert result is None
