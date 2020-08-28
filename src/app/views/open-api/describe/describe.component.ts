import { NestedTreeControl } from '@angular/cdk/tree';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatTreeNestedDataSource } from '@angular/material/tree';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { IOpenApi } from '~/app/models/openapi.model';
import { ApiService } from '~/app/services/api.service';
import { AuthenticationService } from '~/app/services/authentication.service';
import { JsonTreeNode } from '~/app/services/jsontree.service';
import { ButtonType, GenericDialog } from '~/app/utils/generic-dialog/generic-dialog.component';

@Component({
  selector: 'app-openapi-describe',
  templateUrl: './describe.component.html',
  styleUrls: ['./describe.component.scss']
})
export class DescribeComponent implements OnInit, OnDestroy {

  public apis: Array<IOpenApi>;

  public selectedApi: FormControl;
  public selectionSubscription: Subscription;

  public leftTreeControl = new NestedTreeControl<JsonTreeNode>(node => node.children);
  public leftDataSource = new MatTreeNestedDataSource<JsonTreeNode>();

  public rightTreeControl = new NestedTreeControl<JsonTreeNode>(node => node.children);
  public rightDataSource = new MatTreeNestedDataSource<JsonTreeNode>();

  constructor(
    private apiService: ApiService,
    private dialog: MatDialog,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private identificationService: AuthenticationService
  ) { }

  public async ngOnInit() {
    this.selectedApi = new FormControl(undefined, Validators.required);
    this.selectionSubscription = this.selectedApi.valueChanges.subscribe((newVal: IOpenApi) => {
      if (newVal === undefined) return;

      if (newVal === null) {
        //TODO: Make better
        const newApi: IOpenApi = {
          name: "",
          metadata: {},
          id: undefined,
          createdBy: this.identificationService.User.uid,
          openApiSpec: "",
        };

        this.apis.push(newApi);
        this.selectedApi.setValue(newApi);
      }
    });

    this.apis = await this.apiService.getOpenApis();

    this.activatedRoute.queryParams.subscribe(params => {
      this.selectedApi.setValue(this.apis.find(i => i.id === params["selectedId"]));
    });
  }

  public async ngOnDestroy() {
    this.selectionSubscription?.unsubscribe();
  }

  public hasChild = (_: number, node: JsonTreeNode) => !!node.children && node.children.length > 0;

  public handleFileInput(files: FileList) {
    if (files[0]) {
      const fileReader = new FileReader();
      fileReader.onload = (e) => {
        this.selectedApi.value.openApiSpec = JSON.parse(fileReader.result as string)
      }
      fileReader.readAsText(files[0]);
    }
  }

  public reset() {
    this.router.navigate([], {
      queryParams: {
        selectedId: null,
      },
      queryParamsHandling: 'merge'
    });
    this.ngOnInit();
  }

  public async finish() {
    const data: IOpenApi = this.selectedApi.value;
    if (data.name && data.openApiSpec) {
      await this.apiService.updateOpenApi(this.selectedApi.value);
      this.showSuccessDialog();
    } else {
      this.showErrorDialog();
    }
  }

  private showErrorDialog() {
    const dialogRef: MatDialogRef<GenericDialog, void> = this.dialog.open(GenericDialog, {
      position: {
        top: "5%"
      },
      data: {
        title: "Error",
        content: "Please enter all required information.",
        buttons: [ButtonType.OK]
      }
    });
  }

  private showSuccessDialog() {
    const dialogRef: MatDialogRef<GenericDialog, void> = this.dialog.open(GenericDialog, {
      position: {
        top: "5%"
      },
      data: {
        title: "Success",
        content: "The api was successfully edited.",
        buttons: [ButtonType.OK]
      }
    });

    dialogRef.afterClosed().subscribe(() => {
      this.reset();
    });
  }

}
