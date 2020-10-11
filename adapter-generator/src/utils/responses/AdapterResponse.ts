import { SuccessResponse } from "./ApiResponse";

export class AdapterResponse extends SuccessResponse {
    public get Result(): { port: string, token: string } {
        return this.result;
    }
    protected result: {
        port: string
        token: string
    };

    constructor(code: number, messages: Array<string> = [], port: string, token: string, ) {
        super(code, messages);
        this.result = { port, token };
    }
}
