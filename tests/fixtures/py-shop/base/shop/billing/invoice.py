from shop.models import Line


def compute_total(lines: list[Line], tax: float = 0.2) -> float:
    subtotal = sum(line.cents * line.quantity for line in lines)
    return subtotal * (1 + tax)
