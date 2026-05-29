package app.partscan.dto;
import app.partscan.entity.Part;
public record ScanResponse(String status, Part part){}
