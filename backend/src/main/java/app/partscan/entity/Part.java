package app.partscan.entity;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
@Entity
@Table(name="parts")
public class Part {
 @Id
 @GeneratedValue(strategy=GenerationType.UUID)
 private UUID id;
 private String name;
 private String manufacturer;
 private String articleNumber;
 private String category;
 private Double confidence;
 @Column(columnDefinition="TEXT")
 private String imageUrl;
 @Column(columnDefinition="TEXT")
 private String description;
 private String condition;
 @Column(columnDefinition="TEXT")
 private String visibleMarkings;
 @Column(columnDefinition="TEXT")
 private String compatibleVehicles;
 @Column(columnDefinition="TEXT")
 private String sourceHints;
 @Column(columnDefinition="TEXT")
 private String rawAnalysis;
 private Instant createdAt;

 @PrePersist
 void onCreate() {
  if (createdAt == null) createdAt = Instant.now();
 }

 public UUID getId() { return id; }
 public void setId(UUID id) { this.id = id; }
 public String getName() { return name; }
 public void setName(String name) { this.name = name; }
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
 public String getVisibleMarkings() { return visibleMarkings; }
 public void setVisibleMarkings(String visibleMarkings) { this.visibleMarkings = visibleMarkings; }
 public String getCompatibleVehicles() { return compatibleVehicles; }
 public void setCompatibleVehicles(String compatibleVehicles) { this.compatibleVehicles = compatibleVehicles; }
 public String getSourceHints() { return sourceHints; }
 public void setSourceHints(String sourceHints) { this.sourceHints = sourceHints; }
 public String getRawAnalysis() { return rawAnalysis; }
 public void setRawAnalysis(String rawAnalysis) { this.rawAnalysis = rawAnalysis; }
 public Instant getCreatedAt() { return createdAt; }
 public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
