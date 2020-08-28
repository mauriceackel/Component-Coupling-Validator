import { Request, Response, Router } from 'express'
import { NextFunction } from 'connect';
import { ErrorResponse, ApiResponse, SuccessResponse } from '../utils/responses/ApiResponse';
import { AdapterResponse } from '../utils/responses/AdapterResponse';
import * as AdapterService from '../services/OpenApiAdapterService';
import { IOpenApiMapping } from '../models/MappingModel';
import { logger } from '../Service';
import { AdapterType } from '../models/AdapterModel';

const router: Router = Router();

router.post('/:adapterType', createAdapter);
async function createAdapter(req: Request, res: Response, next: NextFunction) {
    const body: { mapping: IOpenApiMapping } = req.body;

    let response: ApiResponse;
    if (body.mapping) {
        try {
            const fileId = await AdapterService.createAdapter(req.params.adapterType as AdapterType, body.mapping);

            response = new AdapterResponse(200, undefined, fileId);
        } catch (err) {
            logger.error(err);
            response = new ErrorResponse(500);
        }
    } else {
        logger.error("No mapping data provided");
        response = new ErrorResponse(400, ["No mapping data provided"]);
    }
    res.status(response.Code).json(response);
}

export default router;
