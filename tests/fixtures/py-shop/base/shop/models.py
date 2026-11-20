from dataclasses import dataclass


@dataclass
class Line:
    sku: str
    cents: int
    quantity: int = 1
