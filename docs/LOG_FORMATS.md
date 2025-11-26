# Format de Logs Estàndard: JSON Lines (JSONL)

Aquest servidor de telemetria utilitza **JSON Lines (JSONL)** com a format estàndard per a l'exportació de logs. JSONL és el format més àmpliament adoptat per a logging estructurat a la indústria.

## Què és JSON Lines (JSONL)?

JSON Lines (també conegut com a Newline Delimited JSON o NDJSON) és un format on cada línia conté un objecte JSON vàlid, separat per caràcters de nova línia.

**Especificació oficial**: http://jsonlines.org/

### Característiques

- **UTF-8 Encoding**: Compatible i llegible en diferents sistemes
- **Line-Delimited**: Cada línia és un objecte JSON vàlid
- **Newline as Delimiter**: Simplifica la separació d'entrades de log
- **Structured Data**: Facilita el parsing i l'anàlisi comparat amb logs no estructurats
- **Compatible amb Unix Tools**: Funciona bé amb eines de processament de text orientades a línies

## Format de Sortida

Cada línia del fitxer JSONL conté un objecte JSON amb la següent estructura:

```json
{"@timestamp":"2024-01-15T10:30:00.000Z","@version":"1","event":"tool_call","message":"Telemetry event: tool_call","fields":{"id":1,"serverId":"server-123","version":"1.0.0","sessionId":"session-456","userId":"user-789","receivedAt":"2024-01-15T10:30:00.100Z","createdAt":"2024-01-15T10:30:00.050Z"},"data":{"toolName":"execute_queries_and_dml","success":true,"duration":150}}
```

### Camps Principals

- `@timestamp`: Timestamp de l'esdeveniment (ISO 8601)
- `@version`: Versió del format (actualment "1")
- `event`: Tipus d'esdeveniment (tool_call, tool_error, session_start, etc.)
- `message`: Missatge descriptiu de l'esdeveniment
- `fields`: Metadades de l'esdeveniment (id, serverId, version, sessionId, userId, etc.)
- `data`: Dades específiques de l'esdeveniment (contingut variable)

## Compatibilitat amb Eines de Tercers

JSONL és compatible amb la majoria d'eines de logging i anàlisi:

### ELK Stack (Elasticsearch, Logstash, Kibana)

**Configuració Logstash**:
```ruby
input {
  http {
    port => 5044
    codec => json_lines
  }
}

filter {
  json {
    source => "message"
  }

  date {
    match => [ "@timestamp", "ISO8601" ]
  }
}

output {
  elasticsearch {
    hosts => ["localhost:9200"]
    index => "telemetry-%{+YYYY.MM.dd}"
  }
}
```

**Enviar logs a Logstash**:
```bash
curl -X POST http://logstash:5044 \
  -H "Content-Type: application/x-ndjson" \
  --data-binary @logs.jsonl
```

### Splunk

Splunk suporta nativament la ingestió de logs en format JSON. Simplement:

1. **Via HTTP Event Collector (HEC)**:
```bash
curl -k https://splunk:8088/services/collector/event \
  -H "Authorization: Splunk <token>" \
  -H "Content-Type: application/x-ndjson" \
  --data-binary @logs.jsonl
```

2. **Via Monitor Input**: Configura Splunk per monitoritzar un directori amb fitxers JSONL

### Datadog

**Via Logs API**:
```bash
curl -X POST "https://http-intake.logs.datadoghq.com/v1/input/<api_key>" \
  -H "Content-Type: application/x-ndjson" \
  --data-binary @logs.jsonl
```

**Via Datadog Agent**: Configura el Datadog Agent per llegir fitxers JSONL

### Grafana Loki

**Via Promtail**:
```yaml
scrape_configs:
  - job_name: telemetry
    static_configs:
      - targets:
          - localhost
        labels:
          job: telemetry
          __path__: /var/log/telemetry/*.jsonl
    pipeline_stages:
      - json:
          expressions:
            timestamp: "@timestamp"
            event: "event"
      - labels:
          event:
```

### Altres Eines Compatibles

- **AWS CloudWatch**: Suporta JSONL com a format d'exportació
- **Google BigQuery**: Utilitza JSONL com a format principal d'import/export
- **MongoDB**: `mongoimport` suporta JSONL nativament
- **PostgreSQL**: El comandament `COPY` suporta JSONL
- **Elasticsearch**: Bulk API utilitza JSONL
- **Apache Kafka**: JSONL és un format estàndard per serialització de missatges
- **ClickHouse**: Format `JSONEachRow` (JSONL) per ingestió ràpida

## API d'Exportació

### Endpoint

**GET** `/api/export/logs`

### Paràmetres

- `startDate` (opcional): Data d'inici (format ISO 8601 o YYYY-MM-DD)
- `endDate` (opcional): Data de fi (format ISO 8601 o YYYY-MM-DD)
- `eventType` (opcional): Filtrar per tipus d'esdeveniment
- `serverId` (opcional): Filtrar per ID de servidor
- `limit` (opcional): Nombre màxim d'esdeveniments a exportar. Per defecte: 10000

### Exemples

**Exportar tots els logs**:
```bash
curl "http://localhost:3100/api/export/logs" -o logs.jsonl
```

**Exportar amb filtres**:
```bash
curl "http://localhost:3100/api/export/logs?startDate=2024-01-01&eventType=tool_call" -o logs.jsonl
```

**Exportar per un servidor específic**:
```bash
curl "http://localhost:3100/api/export/logs?serverId=server-123&limit=5000" -o logs.jsonl
```

### Resposta

Retorna un fitxer JSONL descarregable amb:
- **Content-Type**: `application/x-ndjson`
- **Filename**: `telemetry-logs-YYYY-MM-DD.jsonl`

## Avantatges de JSONL

1. **Universalitat**: Suportat per la majoria d'eines de logging
2. **Simplicitat**: Fàcil de llegir i processar
3. **Eficiència**: Permet processar un registre a la vegada (streaming)
4. **Compatibilitat**: Funciona amb eines Unix i pipelines de shell
5. **Estructurat**: Facilita l'anàlisi comparat amb logs de text pla
6. **Escalabilitat**: Ideal per a grans volums de dades i streaming

## Millors Pràctiques

1. **Rotació de Logs**: Implementa rotació de logs per evitar fitxers massa grans
2. **Compressió**: Comprimeix logs antics per estalviar espai (gzip, bzip2)
3. **Retenció**: Defineix polítiques de retenció segons necessitats de compliança
4. **Seguretat**: Assegura't que els logs no continguin informació sensible (PII, tokens, etc.)
5. **Monitoring**: Monitoritza el volum de logs per detectar anomalies
6. **Indexació**: Utilitza eines d'indexació per cerques eficients (Elasticsearch, etc.)

## Referències

- [JSON Lines Specification](http://jsonlines.org/)
- [NDJSON Format](https://ndjson.com/)
- [Elasticsearch Bulk API](https://www.elastic.co/guide/en/elasticsearch/reference/current/docs-bulk.html)
- [Splunk JSON Format](https://docs.splunk.com/Documentation/Splunk/latest/Data/AnoverviewofSplunkdataformats)
- [Datadog Logs](https://docs.datadoghq.com/logs/)
