package app.partscan.controller;

import app.partscan.service.OpenAiVisionException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {
 @ExceptionHandler(IllegalArgumentException.class)
 public ResponseEntity<Map<String, String>> badRequest(IllegalArgumentException exception) {
  return ResponseEntity.badRequest().body(Map.of("error", exception.getMessage()));
 }

 @ExceptionHandler(IllegalStateException.class)
 public ResponseEntity<Map<String, String>> failedDependency(IllegalStateException exception) {
  return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("error", exception.getMessage()));
 }

 @ExceptionHandler(OpenAiVisionException.class)
 public ResponseEntity<Map<String, String>> openAiError(OpenAiVisionException exception) {
  return ResponseEntity.status(exception.getStatus()).body(Map.of("error", exception.getMessage()));
 }
}
