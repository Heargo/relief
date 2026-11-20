from flask import Flask, jsonify
import requests

from shop.billing.invoice import compute_total
from shop.models import Line
from shop.util.format import format_price

app = Flask(__name__)


@app.get("/invoice")
def invoice():
    lines = [Line("book", 1200), Line("pen", 150, 2)]
    total = compute_total(lines)
    return jsonify(total=format_price(int(total)))


@app.get("/rates")
def rates():
    return requests.get("https://rates.example.com").json()
