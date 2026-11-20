def format_price(cents: int) -> str:
    euros, rest = divmod(cents, 100)
    return f"{euros}.{rest:02d} EUR"
