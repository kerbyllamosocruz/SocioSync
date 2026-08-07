# TikTok Captcha Solver

Python client for TikTok Captcha Solving service.

Allowed usage methods:

- [RapidAPI](https://rapidapi.com/JustScrape/api/tiktok-captcha-solver12) - temporarily unavailable
- [Private API](#usage-examples) - reach out to us at [t.me/justscrape](https://t.me/justscrape) to get API URL and API key

**Solve any TikTok CAPTCHA in milliseconds — for pennies.**

![Example](https://i.ibb.co/nsQxC6kt/image-25-1.png)

## Table of Contents

1. [🧑‍💻 What we do?](#what-we-do)
2. [💡 Why choose us?](#why-choose-us)
3. [🤝 Need more?](#need-more)
4. [🔗 Links](#links)
5. [⚙️ Installation](#installation)
6. [📄 Usage examples](#usage-examples)  
  6.1. [Slide (puzzle)](#slide-example)  
  6.2. [Whirl (rotate)](#whirl-example)  
  6.3. [3D (same object)](#3d-example)  
  6.4. [Hashcash](#hashcash-example)  
  6.5. [End-to-end verification](#end-to-end-verification-example)

## 🧑‍💻 What we do?<a id="what-we-do"></a>

| CAPTCHA type            | Accuracy | Avg. solve time |
|-------------------------|:--------:|:---------------:|
| Puzzle (slider)       | **99.7%** | **&lt; 8 ms** |
| Whirl (rotate)        | **99.5%** | **&lt; 10 ms** |
| 3D (same object)    | **99.7%** | **10 – 100 ms** |
| Hashcash            | **100%** | **&lt; 50 ms** |
| ⭐ **End-to-End Verification**   | **99.5+%** | **4 – 5 sec** |

**10+ million CAPTCHAs solved every day.** Join the traffic you can trust.

And don't forget to check out our [TikTok reverse engineering project](https://github.com/justscrapeme/tiktok-web-reverse-engineering).

## 💡 Why choose us?<a id="why-choose-us"></a>

- Blazing-fast — sub-10 ms latency for slide & rotate puzzles.
- Battle-tested — production accuracy &gt; 99.5% across all puzzle types.
- Budget-friendly — starts at 0.001$ and goes to as low as 0.0002$ per solve; custom volume discounts available.
- One call, done — optional end-to-end verification functionality to automatically validate verifyFp.

## 🤝 Need more?<a id="need-more"></a>

- Direct API access
- 1M+ solves / month
- Dedicated instances or on-prem
- SLA & priority support

We've got you covered, ping us — we’ll tailor a plan.

## 🔗 Links<a id="links"></a>

| Source  | Details |
|----------|---------|
| Telegram | **[@justscrape](https://t.me/justscrape)** |
| Email    | **[just.scrape.dev@gmail.com](mailto:just.scrape.dev@gmail.com)** |
| RapidAPI    | **[JustScrape/api/tiktok-captcha-solver12](https://rapidapi.com/JustScrape/api/tiktok-captcha-solver12)** |
| PyPI    | **[tiktok-captcha](https://pypi.org/project/tiktok-captcha/)** |
| TikTok Reverse Engineering    | **[tiktok-web-reverse-engineering](https://github.com/justscrapeme/tiktok-web-reverse-engineering)** |

## ⚙️ Installation<a id="installation"></a>

```shell
# With uv
uv add tiktok-captcha

# With poetry
poetry add tiktok-captcha

# With pip
pip install tiktok-captcha
```

## 📄 Usage examples<a id="usage-examples"></a>

### Instantiate the service

```python
from tiktok_captcha import TikTokCaptchaSolver, PrivateAPIServiceLocation

captcha_solver = TikTokCaptchaSolver(
    service_location=PrivateAPIServiceLocation(
        url="<private API URL>",
        api_key="<your private API key>"
    )
)
```

### Slide (puzzle)<a id="slide-example"></a>

```python
solution = await captcha_solver.solve_puzzle(
    raw_puzzle=puzzle, # byte-like puzzle image
    raw_background=background, # byte-like background image
    drag_width=348, # Width of the draggable element in pixels
)
print(solution.drag_distance)
```

### Whirl (rotate)<a id="whirl-example"></a>

```python
solution = await captcha_solver.solve_whirl(
    raw_inner=inner, # byte-like inner image
    raw_outer=outer, # byte-like outer image
    drag_width=348, # Width of the draggable element in pixels
)
print(solution.drag_distance)
```

### 3D (same object)<a id="3d-example"></a>

```python
solution = await captcha_solver.solve_3d(
    raw_image=image, # byte-like image
    modified_img_width=348, # Width of the modified image in pixels
)
print(solution.x1, solution.y1, solution.x2, solution.y2)
```

### Hashcash<a id="hashcash-example"></a>

```python
solution = await captcha_solver.solve_hashcash(
    prefix="1777662666", # hashcash question prefix returned by TikTok
    required_bits=8, # number of leading bits that must match
    stamp=3471963987, # hashcash question stamp returned by TikTok
)
print(solution.answer)
```

### End-to-end verification<a id="end-to-end-verification-example"></a>

❗ NOTE:

1. Example values are for demonstration purposes only. Use your own values when making real requests.
2. This request intentionally succeeds a couple seconds longer to closely emulate the real user verification process.

```python
await captcha_solver.verify(
    subtype="slide",
    device_id="7541149000466466326",
    iid="0",
    verify_fp="verify_melwajzm_OnirqqA7_URpG_4L5b_8cWP_sQJNrIwZwAiX",
    region="no1a",
    detail="l2uF9tjRXulja4sQC05*D8yBqyrp*eRr*-uqAgt7z8xlrsXKqIVLLiWZwGV64jmslIvcOPAU4JKNbZMsUJRIaUnijEggW8mTVlXY2RwTdjOCBr4za7YfTv*DiCcwGQtFKCOyQSOzy-76U346Dio0dGMkR7xOMRh325M8HaBjrD70HvJYyMVBBVFvmqK6ZtyuYIvcVRmSTgILRAKfcz9rNC1l9Q1AgN20VxbvCnWfP-dosVsIKCZh4CdKsiMAzWKvxYu0rSyCljqeVVjJ1*Z1285q3UO3xGsXJFR6l9kA4XPo*wUrO0SvRBiHhDF*7jCH*JlJe*4W0qKpTzKnHQRFeHZP3M6Pd-87ENAMmBWRbrJ*RcSoSXCtPBHivJHpHa2OTR5uQhTbQV9gGOwUwPGQHKq2ZzCVM-hL4gslyrjwlvIMoCJD4xs.",
    server_sdk_env='{"idc":"my","region":"ALISG","server_type":"passport"}',
    ms_token="PGvFJUZMmE1v3MQ_WMpH-0K7bBTXeL0-irnmjjS8gBC7mea5HnotpBefv0Nb_WlII8XQMRG6plihRpdodDU5mq4RN7q4FQ5XnR3d2MDKHW_sZfIp7-utleWMnMKu2q9zrQBwEkFrYRlBOMBDb7Zu_lU=",
    proxy="username:password@host:port",
)
```
