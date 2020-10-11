import { Component, OnInit } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ITask, TaskType } from '~/app/models/task.model';
import { TaskService } from '~/app/services/task.service';

@Component({
  selector: 'app-home',
  templateUrl: './evaluation.component.html',
  styleUrls: ['./evaluation.component.scss']
})
export class EvaluationComponent implements OnInit {

  public task = new FormControl(undefined, Validators.required);

  public tasks = new Array<ITask>();

  constructor(private router: Router, public taskService: TaskService, private route: ActivatedRoute) { }

  public async ngOnInit() {
    this.tasks = await this.taskService.getTasks();
    if(this.taskService.TaskRunning) {
      this.task.setValue(this.tasks.find(t => t.id === this.taskService.ActiveTask.id))
    }
  }

  public startTask(task: ITask) {
    this.taskService.startTask(task);

    switch (task.type) {
      case TaskType.MANUAL: this.router.navigate(['../transformation'], { relativeTo: this.route, queryParams: { sourceId: task.sourceInterface, targetId: task.targetInterface } }); break;
      case TaskType.TOOL_ONLY:
      case TaskType.TOOL_FULL: this.router.navigate(['../transformation'], { relativeTo: this.route, queryParams: { selectedId: task.sourceInterface } }); break;
      default: throw new Error("Unknown mapping type");
    }
  }

  public abortTask() {
    this.taskService.abortTask();
    this.task.reset();
  }
}
