package app.partscan.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.RestClientResponseException;

public class GeminiVisionException extends RuntimeException {
 private final HttpStatus status;

 private GeminiVisionException(HttpStatus status, String message) {
  super(message);
  this.status = status;
 }

 public HttpStatus getStatus() {
  return status;
 }

 public static GeminiVisionException from(RestClientResponseException exception, ObjectMapper objectMapper) {
  HttpStatus status = HttpStatus.resolve(exception.getStatusCode().value());
  if (status == null) status = HttpStatus.BAD_GATEWAY;

  String message = "";
  try {
   JsonNode error = objectMapper.readTree(exception.getResponseBodyAsString()).path("error");
   message = error.path("message").asText("");
  } catch (Exception ignored) {
   message = exception.getMessage();
  }

  if (status == HttpStatus.TOO_MANY_REQUESTS) {
   return new GeminiVisionException(HttpStatus.TOO_MANY_REQUESTS, "Gemini временно ограничил запросы. Подождите немного и попробуйте снова.");
  }

  String safeMessage = message.isBlank() ? "Gemini не смог обработать фото" : message;
  return new GeminiVisionException(status.is4xxClientError() ? HttpStatus.BAD_GATEWAY : status, safeMessage);
 }
}
