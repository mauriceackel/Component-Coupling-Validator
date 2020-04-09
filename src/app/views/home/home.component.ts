import { Component, OnInit } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { ITask } from '~/app/models/task.model';
import { TaskService } from '~/app/services/task.service';
import { Router } from '@angular/router';
import { MappingType } from '~/app/models/mapping.model';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {

  public task = new FormControl(undefined, Validators.required);

  public tasks = new Array<ITask>();

  constructor(private router: Router, public taskService: TaskService) { }

  public async ngOnInit() {
    this.tasks = await this.taskService.getTasks();
    if(this.taskService.TaskRunning) {
      this.task.setValue(this.tasks.find(t => t.id === this.taskService.ActiveTask.id))
    }
  }

  public startTask(task: ITask) {
    this.taskService.startTask(task);

    switch(task.mappingType) {
      case MappingType.MANUAL: this.router.navigate(['/manual'], { queryParams: { sourceId: task.sourceInterface, targetId: task.targetInterface } }); break;
      case MappingType.TRANSFORMATION: this.router.navigate(['/transformation'], { queryParams: { sourceId: task.sourceInterface, targetId: task.targetInterface } }); break;
      case MappingType.JSONLD: this.router.navigate(['/jsonld'], { queryParams: { sourceId: task.sourceInterface, targetId: task.targetInterface } }); break;
      default: throw new Error("Unknown mapping type");
    }
  }

  public abortTask() {
    this.taskService.abortTask();
    this.task.reset();
  }
}
