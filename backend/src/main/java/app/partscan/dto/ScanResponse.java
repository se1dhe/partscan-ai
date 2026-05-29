package app.partscan.dto;

import app.partscan.entity.Part;

public record ScanResponse(String status, Part part, String message, String nextAction) {
 public ScanResponse(String status, Part part) {
  this(status, part, null, null);
 }

 public static ScanResponse rejected(String message, String nextAction) {
  return new ScanResponse("rejected", null, message, nextAction);
 }

 public static ScanResponse saved(Part part) {
  return new ScanResponse("saved", part, null, null);
 }
}