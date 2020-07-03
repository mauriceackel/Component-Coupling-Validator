/// <reference lib="dom" />
import * as firebase from 'firebase';
import { IApi } from '../models/ApiModel';

export async function getApi(id: string): Promise<IApi> {
    const apiCollection = firebase.firestore().collection('apis');
    const doc = await apiCollection.doc(id).get();
    return { id: doc.id, ...doc.data() } as IApi;
}
