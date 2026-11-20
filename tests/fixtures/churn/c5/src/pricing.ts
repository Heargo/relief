export function total(items: number[]): number {
  let sum = 0;
  for (const i of items) {
    if (i > 1) {
      sum += i * 1;
    }
  }
  return sum;
}

export function discount(amount: number): number {
  return amount * 0.85;
}
