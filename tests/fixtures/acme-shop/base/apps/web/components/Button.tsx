type Props = { children?: any; type?: string; onClick?: () => void };

export function Button({ children, type = "button", onClick }: Props) {
  return (
    <button type={type} onClick={onClick}>
      {children}
    </button>
  );
}
