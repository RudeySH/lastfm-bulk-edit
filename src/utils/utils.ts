import { Semaphore } from 'async-mutex';

export function delay(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

const semaphore = new Semaphore(6);
let delayPromise: Promise<void> | undefined = undefined;
let delayTooManyRequestsMs = 10000;

export async function fetchAndRetry<TResult = Response>(url: string, init?: RequestInit | undefined, callback?: (response: Response, i: number) => Promise<TResult | undefined>): Promise<TResult> {
	callback ??= async (response) => response as TResult;

    return await semaphore.runExclusive(async () => {
        let delayResolver!: () => void;
        let delayRejecter!: (reason: unknown) => void;

        try {
            // eslint-disable-next-line no-constant-condition
            for (let i = 0; true; i++) {
                const response = await fetch(url, init);

                if (response.ok) {
                    const result = await callback(response, i);

                    if (result !== undefined) {
                        if (delayResolver !== undefined) {
                            delayPromise = undefined;
                            delayResolver();
                        }

                        return result;
                    }
                }

                if (delayPromise === undefined) {
                    delayPromise = new Promise((resolve, reject) => {
                        delayResolver = resolve;
                        delayRejecter = reject;
                    });

                    if (response.status === 429) { // Too Many Requests
                        await delay(delayTooManyRequestsMs);
                    } else {
                        await delay(1000);
                    }
                } else if (delayResolver !== undefined) {
                    if (response.status === 429) { // Too Many Requests
                        // retry after 10 seconds, then another 10 seconds, etc. up to 60 seconds, finally retry after every second.
                        const additionalDelayMs = delayTooManyRequestsMs < 60000 ? 10000 : 1000;
                        delayTooManyRequestsMs += additionalDelayMs;
                        await delay(additionalDelayMs);
                    } else if (i < 5) {
                        // retry after 2 seconds, then 4 seconds, then 8, finally 16 (30 seconds total)
                        await delay(Math.pow(2, i) * 1000);
                    } else {
                        throw response.statusText ?? response.status.toString();
                    }
                } else {
                    await delayPromise;
                }
            }
        } catch (reason) {
            if (delayRejecter !== undefined) {
                delayRejecter(reason);
            }

            throw reason;
        }
    });
}
