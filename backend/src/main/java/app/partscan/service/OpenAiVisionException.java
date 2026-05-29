package app.partscan.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.RestClientResponseException;

public class OpenAiVisionException extends RuntimeException {
 private final HttpStatus status;

 private OpenAiVisionException(HttpStatus status, String message) {
  super(message);
  this.status = status;
 }

 public HttpStatus getStatus() {
  return status;
 }

 public static OpenAiVisionException from(RestClientResponseException exception, ObjectMapper objectMapper) {
  HttpStatus status = HttpStatus.resolve(exception.getStatusCode().value());
  if (status == null) status = HttpStatus.BAD_GATEWAY;

  String code = "";
  String upstreamMessage = "";
  try {
   JsonNode error = objectMapper.readTree(exception.getResponseBodyAsString()).path("error");
   code = error.path("code").asText("");
   upstreamMessage = error.path("message").asText("");
  } catch (Exception ignored) {
   upstreamMessage = exception.getMessage();
  }

  if ("insufficient_quota".equals(code)) {
   return new OpenAiVisionException(HttpStatus.PAYMENT_REQUIRED, "На OpenAI ключе закончилась квота или не подключён billing. Обновите OPENAI_API_KEY в Railway после пополнения/ротации ключа.");
  }

  if (status == HttpStatus.TOO_MANY_REQUESTS) {
   return new OpenAiVisionException(HttpStatus.TOO_MANY_REQUESTS, "OpenAI временно ограничил запросы. Подождите немного и попробуйте снова.");
  }

  String message = upstreamMessage.isBlank() ? "OpenAI не смог обработать фото" : upstreamMessage;
  return new OpenAiVisionException(status.is4xxClientError() ? HttpStatus.BAD_GATEWAY : status, message);
 }
}
