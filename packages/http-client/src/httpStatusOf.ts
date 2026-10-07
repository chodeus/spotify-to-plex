/** The HTTP status a failed request was answered with, or undefined when there was no answer. */
export function httpStatusOf(error: unknown) {
    return (error as { response?: { status?: number } } | undefined)?.response?.status;
}
