import { Component, OnInit, OnDestroy } from '@angular/core';
import { IInterface } from '~/app/models/interface.model';
import { FormControl, Validators } from '@angular/forms';
import { InterfaceService } from '~/app/services/interface.service';
import { ActivatedRoute, Router } from '@angular/router';
import { TaskService } from '~/app/services/task.service';
import { MatDialogRef, MatDialog } from '@angular/material/dialog';
import { GenericDialog, ButtonType } from '~/app/utils/generic-dialog/generic-dialog.component';

@Component({
  selector: 'app-describe',
  templateUrl: './describe.component.html',
  styleUrls: ['./describe.component.scss']
})
export class DescribeComponent implements OnInit, OnDestroy {

  public interfaces: Array<IInterface>;

  public selectedInterface: FormControl;

  constructor(
    private interfaceService: InterfaceService,
    private dialog: MatDialog,
    private activatedRoute: ActivatedRoute,
    private taskService: TaskService,
    private router: Router
  ) { }

  public async ngOnInit() {
    this.selectedInterface = new FormControl(undefined, Validators.required);

    this.interfaces = await this.interfaceService.getInterfaces();

    this.activatedRoute.queryParams.subscribe(params => {
      this.selectedInterface.setValue(this.interfaces.find(i => i.id === params["selectedId"]));
    });
  }

  public async ngOnDestroy() {
    this.taskService.pauseTask();
  }

  public save(jsonLdContext: any, iface: IInterface, ref: { jsonLdContext: any }) {
    if (iface) {
      ref.jsonLdContext = jsonLdContext;
      this.interfaceService.updateInterface(iface);
    }
  }

  public reset() {
    this.router.navigate([], {
      queryParams: {
        selectedId: null,
      },
      queryParamsHandling: 'merge'
    });
    this.taskService.abortTask();
    this.ngOnInit();
  }

  public async finish() {
    if (this.taskService.TaskRunning) {
      this.taskService.finishTask();
      this.showTaskSuccessDialog();
    } else {
      this.showSuccessDialog();
    }
  }

  private showSuccessDialog() {
    const dialogRef: MatDialogRef<GenericDialog, void> = this.dialog.open(GenericDialog, {
      position: {
        top: "5%"
      },
      data: {
        title: "Mapping Success",
        content: "The mapping was successsfully created.",
        buttons: [ButtonType.OK]
      }
    });

    dialogRef.afterClosed().subscribe(() => {
      this.reset();
    });
  }

  private showTaskSuccessDialog() {
    const dialogRef: MatDialogRef<GenericDialog, void> = this.dialog.open(GenericDialog, {
      position: {
        top: "5%"
      },
      data: {
        title: "Task Finished",
        content: "The task was finished successfully.",
        buttons: [ButtonType.OK]
      }
    });

    dialogRef.afterClosed().subscribe(() => {
      this.router.navigate(["/home"])
    });
  }

}
