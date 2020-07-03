import { Request, Response, Router } from 'express'
import { NextFunction } from 'connect';
import { ErrorResponse } from '../utils/responses/ApiResponse';
import { STORAGE_PATH } from '../config/Config';
import path from 'path';

const router: Router = Router();
const fileIdRegex: RegExp = /\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/

router.get('/:fileId', serveFile);
async function serveFile(req: Request, res: Response, next: NextFunction) {
    if (!fileIdRegex.test(req.params.fileId)) {
        const response = new ErrorResponse(400, ["Bad file id"])
    }

    const filePath = `${STORAGE_PATH}/${req.params.fileId}.zip`;
    if(filePath.startsWith('.')) {
        res.sendFile(path.join(__dirname, '../../', filePath));
    } else {
        res.sendFile(filePath);
    }
}

export default router;