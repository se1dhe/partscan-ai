package app.partscan.dto;

public record PartFeedbackRequest(
 Boolean isCorrect,
 String correctedName,
 String correctedManufacturer,
 String correctedArticleNumber,
 String correctedCategory,
 String note
) {}
