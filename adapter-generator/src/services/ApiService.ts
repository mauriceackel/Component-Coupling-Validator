/// <reference lib="dom" />
import * as firebase from 'firebase';
import { IOpenApi, IAsyncApi } from '../models/ApiModel';

export async function getOpenApi(id: string): Promise<IOpenApi> {
  const apiCollection = firebase.firestore().collection('openApis');
  const doc = await apiCollection.doc(id).get();
  return { id: doc.id, ...doc.data() } as IOpenApi;
}

export async function getAsyncApi(id: string): Promise<IAsyncApi> {
  const apiCollection = firebase.firestore().collection('asyncApis');
  const doc = await apiCollection.doc(id).get();
  return { id: doc.id, ...doc.data() } as IAsyncApi;
}
