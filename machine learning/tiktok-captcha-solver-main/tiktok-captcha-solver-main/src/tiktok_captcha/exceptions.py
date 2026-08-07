class InvalidImageException(Exception):
    pass


class FailedToSolveCaptchaException(Exception):
    pass


class FailedToVerifyCaptchaException(Exception):
    pass


class InvalidProxyException(Exception):
    pass


class ProxyTimeoutException(Exception):
    pass


class UnexpectedResponseException(Exception):
    pass
