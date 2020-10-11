import { Request, Response, Router } from 'express'
import { NextFunction } from 'connect';
import { ApiResponse, ErrorResponse, SuccessResponse } from '../utils/responses/ApiResponse';
import * as DockerService from '../services/DockerService';

const router: Router = Router();
const fileIdRegex: RegExp = /\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/

router.get('/:taskReportId', stopDocker);
async function stopDocker(req: Request, res: Response, next: NextFunction) {
  let response: ApiResponse;
  if (req.params.taskReportId === undefined) {
    response = new ErrorResponse(400, ["Bad taskReportId"]);
  } else {
    await DockerService.stopDocker(req.params.taskReportId);
    response = new SuccessResponse(200);
  }
  res.status(response.Code).json(response);
}

export default router;
