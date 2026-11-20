export class HttpError extends Error {
    constructor(
        public status: number,
        message: string,
    ) {
        super(message);
    }
}

export async function httpGet<T = any>(path: string): Promise<T> {
    const res = await fetch(path, {
        headers: {
            accept: "application/json",
        },
    });
    if (!res.ok) {
        throw new HttpError(res.status, res.statusText);
    }
    return res.json() as Promise<T>;
}

export async function httpPost<T = any>(
    path: string,
    body: unknown,
): Promise<T> {
    const res = await fetch(path, {
        method: "POST",
        headers: {
            accept: "application/json",
            "content-type": "application/json",
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        throw new HttpError(res.status, res.statusText);
    }
    return res.json() as Promise<T>;
}
