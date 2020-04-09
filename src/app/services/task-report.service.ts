import { Injectable } from "@angular/core";
import { AngularFirestore, AngularFirestoreCollection } from '@angular/fire/firestore';
import { removeUndefined } from '../utils/remove-undefined';
import { ITaskReport } from '../models/task-report.model';

@Injectable({
  providedIn: 'root'
})
export class TaskReportService {

  private taskReportColl: AngularFirestoreCollection<ITaskReport>;

  constructor(private firestore: AngularFirestore) {
    this.taskReportColl = firestore.collection('task-reports');
  }

  public async getTaskReports(conditions: { [key: string]: string } = {}): Promise<Array<ITaskReport>> {
    const taskReports = (await this.taskReportColl.get().toPromise()).docs.map(doc => this.parseTaskReport(doc.id, doc.data()));
    const filteredTasks = taskReports.filter(taskReport => Object.entries(conditions).every(e => taskReport[e[0]] === e[1]));

    return filteredTasks;
  }

  public async getTaskReport(id: string): Promise<ITaskReport> {
    const doc = await this.taskReportColl.doc<ITaskReport>(id).get().toPromise();
    return this.parseTaskReport(doc.id, doc.data());
  }

  private parseTaskReport(id: string, taskReport: any): ITaskReport {
    return {
      ...taskReport,
      id
    }
  }

  private serializeTaskReport(taskReport: ITaskReport) {
    let result = {
      ...taskReport,
      id: undefined
    }
    result = removeUndefined(result);
    return result;
  }

  public async createTaskReport(taskReport: ITaskReport) {
    const id = this.firestore.createId();
    return this.taskReportColl.doc(id).set(this.serializeTaskReport(taskReport));
  }

  public async updateTaskReport(taskReport: ITaskReport) {
    return this.taskReportColl.doc(taskReport.id).update(this.serializeTaskReport(taskReport));
  }

}
