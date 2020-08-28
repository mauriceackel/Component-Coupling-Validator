const jsonata = require('jsonata');

const sourceTopic = '{{ params.sourceTopic }}';
const sourceId = '{{ params.sourceId }}';

const targets = [
  {%- for target in params.targets %}
  {
    mapping: '{{ target.mapping|safe }}',
    topic: '{{ target.topic }}',
    id: '{{ target.fullId }}',
    appRef: require('../../../../targets/{{ target.id }}/src/api/index')
  },
  {%- endfor %}
];

{% if params.mappingDirection === '0' -%}
module.exports = (app) => {
  for (const target of targets) {
    target.appRef.use(target.topic, (message) => {
      const { payload, headers } = message;
      const { payload: mappedPayload, headers: mappedHeaders } = jsonata(target.mapping).evaluate({ [target.id]: { payload, headers } })[sourceId];

      console.log('Injecting incoming message:', mappedPayload, mappedHeaders);
      app.injectMessage(mappedPayload, mappedHeaders, sourceTopic);
    });
  }
};
{%- elif params.mappingDirection === '1' -%}
module.exports = (message, next) => {
  const { payload, headers, topic } = message;
  if (topic === sourceTopic) {
    console.log('Intercepting outgoing message:', message);

    for (const target of targets) {
      const { payload: mappedPayload, headers: mappedHeaders } = jsonata(target.mapping).evaluate({ [sourceId]: { payload, headers } })[targetId];
      target.appRef.send(mappedPayload, mappedHeaders, target.topic);
    }

    return;
  }

  next();
};
{%- endif %}
