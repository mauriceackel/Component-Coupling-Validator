import { Injectable } from "@angular/core";
import { AngularFirestore, AngularFirestoreCollection } from '@angular/fire/firestore';
import { ITask } from '../models/task.model';
import { removeUndefined } from '../utils/remove-undefined';
import { ITaskReport } from '../models/task-report.model';
import { AuthenticationService } from './authentication.service';
import { TaskReportService } from './task-report.service';

@Injectable({
  providedIn: 'root'
})
export class TaskService {

  private taskColl: AngularFirestoreCollection<ITask>;

  private _taskRunning: boolean = false;
  public get TaskRunning(): boolean {
    return this._taskRunning;
  }

  private _activeTask: ITask;
  public get ActiveTask(): ITask {
    return this._activeTask;
  }

  private elapsedTime: number;
  private taskStartTimestamp: number;

  constructor(private firestore: AngularFirestore, private authService: AuthenticationService, private taskReportService: TaskReportService) {
    this.taskColl = firestore.collection('tasks');
  }

  public async getTasks(conditions: { [key: string]: string } = {}): Promise<Array<ITask>> {
    const tasks = (await this.taskColl.get().toPromise()).docs.map(doc => this.parseTask(doc.id, doc.data()));
    const filteredTasks = tasks.filter(task => Object.entries(conditions).every(e => task[e[0]] === e[1]));

    return filteredTasks;
  }

  public async getTask(id: string): Promise<ITask> {
    const doc = await this.taskColl.doc<ITask>(id).get().toPromise();
    return this.parseTask(doc.id, doc.data());
  }

  private parseTask(id: string, task: any): ITask {
    return {
      ...task,
      id
    }
  }

  private serializeTask(task: ITask) {
    let result = {
      ...task,
      id: undefined
    }
    result = removeUndefined(result);
    return result;
  }

  public async createTask(task: ITask) {
    const id = this.firestore.createId();
    return this.taskColl.doc(id).set(this.serializeTask(task));
  }

  public async updateTask(task: ITask) {
    return this.taskColl.doc(task.id).update(this.serializeTask(task));
  }

  public startTask(task: ITask) {
    if(!this._taskRunning) {
      //Start a new task
      this._taskRunning = true;
      this._activeTask = task;
      this.elapsedTime = 0;
      this.taskStartTimestamp = Date.now();
    } else {
      //Resume a task
      this.taskStartTimestamp = Date.now();
    }
  }

  public pauseTask() {
    if(this._taskRunning) {
      this.elapsedTime += Date.now() - this.taskStartTimestamp;
    }
  }

  public abortTask() {
    if(this._taskRunning) {
      this._activeTask = undefined;
      this._taskRunning = false;
    }
  }

  public finishTask() {
    if(this._taskRunning) {
      let taskReport: ITaskReport = {
        id: undefined,
        createdBy: this.authService.User.uid,
        task: this._activeTask.id,
        time: this.elapsedTime + (Date.now() - this.taskStartTimestamp)
      }
      this.taskReportService.createTaskReport(taskReport);

      this._activeTask = undefined;
      this._taskRunning = false;
    }
  }

}
