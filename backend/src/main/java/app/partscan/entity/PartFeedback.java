package app.partscan.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "part_feedback")
public class PartFeedback {
 @Id
 @GeneratedValue(strategy = GenerationType.UUID)
 private UUID id;

 @ManyToOne(fetch = FetchType.LAZY)
 @JoinColumn(name = "part_id", nullable = false)
 private Part part;

 private Boolean isCorrect;
 private String suggestedName;
 private String suggestedManufacturer;
 private String suggestedArticleNumber;
 private String suggestedCategory;

 @Column(columnDefinition = "TEXT")
 private String note;

 private Instant createdAt;

 @PrePersist
 void onCreate() {
  if (createdAt == null) createdAt = Instant.now();
 }

 public UUID getId() { return id; }
 public void setId(UUID id) { this.id = id; }
 public Part getPart() { return part; }
 public void setPart(Part part) { this.part = part; }
 public Boolean getIsCorrect() { return isCorrect; }
 public void setIsCorrect(Boolean isCorrect) { this.isCorrect = isCorrect; }
 public String getSuggestedName() { return suggestedName; }
 public void setSuggestedName(String suggestedName) { this.suggestedName = suggestedName; }
 public String getSuggestedManufacturer() { return suggestedManufacturer; }
 public void setSuggestedManufacturer(String suggestedManufacturer) { this.suggestedManufacturer = suggestedManufacturer; }
 public String getSuggestedArticleNumber() { return suggestedArticleNumber; }
 public void setSuggestedArticleNumber(String suggestedArticleNumber) { this.suggestedArticleNumber = suggestedArticleNumber; }
 public String getSuggestedCategory() { return suggestedCategory; }
 public void setSuggestedCategory(String suggestedCategory) { this.suggestedCategory = suggestedCategory; }
 public String getNote() { return note; }
 public void setNote(String note) { this.note = note; }
 public Instant getCreatedAt() { return createdAt; }
 public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
