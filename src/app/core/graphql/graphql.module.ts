import { NgModule } from '@angular/core';
import { HttpClientModule, HttpHeaders } from '@angular/common/http';
import { GC_AUTH_TOKEN } from '../constants';
// Apollo
import { Apollo, ApolloModule } from 'apollo-angular';
import { HttpLink, HttpLinkModule } from 'apollo-angular-link-http';
import { InMemoryCache, defaultDataIdFromObject } from 'apollo-cache-inmemory';
import { ApolloLink } from 'apollo-link';
//import { getOperationAST } from 'graphql';
import { DocumentNode } from 'graphql';
import { WebSocketLink } from 'apollo-link-ws';
import { Storage } from '@ionic/storage';
import { Hermes } from 'apollo-cache-hermes';
import { environment } from '../../../environments/environment';

/* Hack on Websocket, to avoid the use of protocol */
declare let window: any;
const _global = typeof global !== 'undefined' ? global : (typeof window !== 'undefined' ? window : {});
const NativeWebSocket = _global.WebSocket || _global.MozWebSocket;
var AppWebSocket = function (url: string, protocols?: string | string[]) {
  const self = new NativeWebSocket(url/*no protocols*/);
  return self;
} as any;
AppWebSocket.CLOSED = NativeWebSocket.CLOSED;
AppWebSocket.CLOSING = NativeWebSocket.CLOSING;
AppWebSocket.CONNECTING = NativeWebSocket.CONNECTING;
AppWebSocket.OPEN = NativeWebSocket.OPEN;

export const dataIdFromObject = function (object: Object): string {
  switch (object['__typename']) {
    // For generic type 'ReferentialVO', add entityName in the cache key (to distinguish by entity)
    case 'ReferentialVO': return object['entityName'] + ':' + object['id'];
    // Fallback to default cache key
    default: return defaultDataIdFromObject(object);
  }
};

export const getOperationAST = function (query: DocumentNode, operationName: String): {
  operation: String
} {
  if (query && query.definitions && query.definitions[0]) {
    const def: any = query.definitions[0];
    console.debug("[graphql] getOperationAST return operation: " + def.operation);
    if (def.operation) return { operation: def.operation };
  }
  console.log("missing getOperationAST for object: ", query)
  return { operation: "mutation" };
}

WebSocket
@NgModule({
  imports: [
    HttpClientModule,
    ApolloModule,
    HttpLinkModule
  ],
  exports: [
    HttpClientModule,
    ApolloModule,
    HttpLinkModule
  ]
})
export class AppGraphQLModule {
  constructor(apollo: Apollo,
    httpLink: HttpLink,
    storage: Storage) {

    console.info("[app] Creating apollo module...");

    // TODO: auth
    //const token = localStorage.get(GC_AUTH_TOKEN);
    //const authorization = token ? `Bearer ${token}` : null;
    //const headers = new HttpHeaders().append('Authorization', authorization);

    const http = httpLink.create({ uri: environment.remoteBaseUrl + '/graphql' });

    const wsUrl = String.prototype.replace.call(environment.remoteBaseUrl, "http", "ws");
    const ws = new WebSocketLink({
      uri: wsUrl + '/subscriptions/websocket',
      options: {
        reconnect: true
        /*,
        connectionParams: {
          authToken: localStorage.getItem(GC_AUTH_TOKEN),
        }*/
      },
      webSocketImpl: AppWebSocket
    });

    const imCache = new InMemoryCache({
      dataIdFromObject: dataIdFromObject
    });
    // const heCache = new Hermes({
    //   entityIdForNode: dataIdFromObject
    // });

    // create Apollo
    apollo.create({
      link: ApolloLink.split(
        operation => {
          const operationAST = getOperationAST(operation.query, operation.operationName);
          return !!operationAST && operationAST.operation === 'subscription';
        },
        ws,
        http,
      ),
      cache: imCache
    });
  }
}

