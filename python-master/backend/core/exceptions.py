"""
统一异常处理

异常体系：
  Exception
  ├── BusinessError (业务错误，消息可返回前端)
  │   ├── NotFoundException
  │   ├── UnauthorizedException
  │   ├── BadRequestException
  │   ├── ConflictException
  │   └── ValidationException
  └── SystemError (系统错误，消息脱敏后返回前端)
      ├── LLMServiceError
      ├── VectorStoreError
      └── ConfigurationError
"""
from fastapi import status


class BusinessError(Exception):
    def __init__(self, message: str, *, code: str = "BUSINESS_ERROR", status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


class SystemError(Exception):
    def __init__(self, message: str, *, code: str = "SYSTEM_ERROR", status_code: int = 500):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


class APIException(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code


class NotFoundException(BusinessError):
    def __init__(self, resource: str):
        super().__init__(
            message=f"{resource}不存在",
            code="NOT_FOUND_001",
            status_code=status.HTTP_404_NOT_FOUND
        )


class UnauthorizedException(BusinessError):
    def __init__(self, message: str = "未授权访问"):
        super().__init__(
            message=message,
            code="AUTH_003",
            status_code=status.HTTP_403_FORBIDDEN
        )


class BadRequestException(BusinessError):
    def __init__(self, message: str):
        super().__init__(
            message=message,
            code="BAD_REQUEST_001",
            status_code=status.HTTP_400_BAD_REQUEST
        )


class ConflictException(BusinessError):
    def __init__(self, message: str):
        super().__init__(
            message=message,
            code="CONFLICT_001",
            status_code=status.HTTP_409_CONFLICT
        )


class ValidationException(BusinessError):
    def __init__(self, message: str, details: dict | None = None):
        super().__init__(
            message=message,
            code="VALIDATION_001",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY
        )
        self.details = details
