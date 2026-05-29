package app.partscan.entity;
import jakarta.persistence.*;
@Entity
@Table(name="parts")
public class Part {
 @Id @GeneratedValue(strategy=GenerationType.UUID)
 private java.util.UUID id;
 private String name;
 private String manufacturer;
 private String articleNumber;
 private String category;
 private Double confidence;
 private String imageUrl;
}
