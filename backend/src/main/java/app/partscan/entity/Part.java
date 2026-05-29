package app.partscan.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "parts")
public class Part {
 @Id
 @GeneratedValue(strategy = GenerationType.UUID)
 private UUID id;

 private String name;
 private String normalizedName;
 private String manufacturer;
 private String articleNumber;
 private String category;
 private Double confidence;

 @Column(columnDefinition = "TEXT")
 private String imageUrl;

 @Column(columnDefinition = "TEXT")
 private String description;

 private String condition;
 private Boolean needsBetterPhoto;

 @Column(columnDefinition = "TEXT")
 private String identificationReason;

 @Column(columnDefinition = "TEXT")
 private String visibleMarkings;

 @Column(columnDefinition = "TEXT")
 private String compatibleVehicles;

 @Column(columnDefinition = "TEXT")
 private String sourceHints;

 @Column(columnDefinition = "TEXT")
 private String photoTips;

 @Column(columnDefinition = "TEXT")
 private String alternatives;

 @Column(columnDefinition = "TEXT")
 private String rawAnalysis;

 private String reviewStatus;
 private Instant createdAt;
 private Instant updatedAt;

 @PrePersist
 void onCreate() {
  Instant now = Instant.now();
  if (createdAt == null) createdAt = now;
  if (updatedAt == null) updatedAt = now;
  if (reviewStatus == null || reviewStatus.isBlank()) reviewStatus = "pending";
 }

 @PreUpdate
 void onUpdate() {
  updatedAt = Instant.now();
 }

 public UUID getId() { return id; }
 public void setId(UUID id) { this.id = id; }
 public String getName() { return name; }
 public void setName(String name) { this.name = name; }
 public String getNormalizedName() { return normalizedName; }
 public void setNormalizedName(String normalizedName) { this.normalizedName = normalizedName; }
 public String getManufacturer() { return manufacturer; }
 public void setManufacturer(String manufacturer) { this.manufacturer = manufacturer; }
 public String getArticleNumber() { return articleNumber; }
 public void setArticleNumber(String articleNumber) { this.articleNumber = articleNumber; }
 public String getCategory() { return category; }
 public void setCategory(String category) { this.category = category; }
 public Double getConfidence() { return confidence; }
 public void setConfidence(Double confidence) { this.confidence = confidence; }
 public String getImageUrl() { return imageUrl; }
 public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }
 public String getDescription() { return description; }
 public void setDescription(String description) { this.description = description; }
 public String getCondition() { return condition; }
 public void setCondition(String condition) { this.condition = condition; }
 public Boolean getNeedsBetterPhoto() { return needsBetterPhoto; }
 public void setNeedsBetterPhoto(Boolean needsBetterPhoto) { this.needsBetterPhoto = needsBetterPhoto; }
 public String getIdentificationReason() { return identificationReason; }
 public void setIdentificationReason(String identificationReason) { this.identificationReason = identificationReason; }
 public String getVisibleMarkings() { return visibleMarkings; }
 public void setVisibleMarkings(String visibleMarkings) { this.visibleMarkings = visibleMarkings; }
 public String getCompatibleVehicles() { return compatibleVehicles; }
 public void setCompatibleVehicles(String compatibleVehicles) { this.compatibleVehicles = compatibleVehicles; }
 public String getSourceHints() { return sourceHints; }
 public void setSourceHints(String sourceHints) { this.sourceHints = sourceHints; }
 public String getPhotoTips() { return photoTips; }
 public void setPhotoTips(String photoTips) { this.photoTips = photoTips; }
 public String getAlternatives() { return alternatives; }
 public void setAlternatives(String alternatives) { this.alternatives = alternatives; }
 public String getRawAnalysis() { return rawAnalysis; }
 public void setRawAnalysis(String rawAnalysis) { this.rawAnalysis = rawAnalysis; }
 public String getReviewStatus() { return reviewStatus; }
 public void setReviewStatus(String reviewStatus) { this.reviewStatus = reviewStatus; }
 public Instant getCreatedAt() { return createdAt; }
 public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
 public Instant getUpdatedAt() { return updatedAt; }
 public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
