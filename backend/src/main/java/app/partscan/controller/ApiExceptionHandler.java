package app.partscan.controller;

import app.partscan.service.GeminiVisionException;
import app.partscan.service.OpenAiVisionException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {
 private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

 @ExceptionHandler(IllegalArgumentException.class)
 public ResponseEntity<Map<String, String>> badRequest(IllegalArgumentException exception) {
  log.warn("Bad request: message={}", exception.getMessage());
  return ResponseEntity.badRequest().body(Map.of("error", exception.getMessage()));
 }

 @ExceptionHandler(IllegalStateException.class)
 public ResponseEntity<Map<String, String>> failedDependency(IllegalStateException exception) {
  log.warn("Application dependency is unavailable: message={}", exception.getMessage());
  return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("error", exception.getMessage()));
 }

 @ExceptionHandler(NoResourceFoundException.class)
 public ResponseEntity<Map<String, String>> missingStaticResource(NoResourceFoundException exception) {
  log.debug("Static resource not found: {}", exception.getResourcePath());
  return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Resource not found"));
 }

 @ExceptionHandler(OpenAiVisionException.class)
 public ResponseEntity<Map<String, String>> openAiError(OpenAiVisionException exception) {
  log.warn("OpenAI API error handled: status={}, message={}", exception.getStatus(), exception.getMessage());
  return ResponseEntity.status(exception.getStatus()).body(Map.of("error", exception.getMessage()));
 }

 @ExceptionHandler(GeminiVisionException.class)
 public ResponseEntity<Map<String, String>> geminiError(GeminiVisionException exception) {
  log.warn("Gemini API error handled: status={}, message={}", exception.getStatus(), exception.getMessage());
  return ResponseEntity.status(exception.getStatus()).body(Map.of("error", exception.getMessage()));
 }

 @ExceptionHandler(Exception.class)
 public ResponseEntity<Map<String, String>> unexpectedError(Exception exception) {
  log.error("Unexpected backend error", exception);
  return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", "Внутренняя ошибка сервера. Подробности записаны в логи."));
 }
}
