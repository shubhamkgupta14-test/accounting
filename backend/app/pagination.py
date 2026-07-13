import math
import re
from typing import Any, Literal

from fastapi import Query
from pydantic import BaseModel

from app.utils import serialize_many

SortOrder = Literal["asc", "desc"]


class PageParams:
    def __init__(
        self,
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=25, ge=1, le=100),
    ):
        self.page = page
        self.page_size = page_size

    @property
    def skip(self) -> int:
        return (self.page - 1) * self.page_size


class PageResponse(BaseModel):
    items: list[dict[str, Any]]
    page: int
    page_size: int
    total: int
    pages: int


def page_response(items, params: PageParams, total: int) -> dict[str, Any]:
    return {
        "items": serialize_many(items),
        "page": params.page,
        "page_size": params.page_size,
        "total": total,
        "pages": math.ceil(total / params.page_size) if total else 0,
    }


def safe_search(value: str | None) -> str | None:
    value = value.strip() if value else ""
    return re.escape(value) if value else None


def sort_direction(order: SortOrder) -> int:
    return 1 if order == "asc" else -1
