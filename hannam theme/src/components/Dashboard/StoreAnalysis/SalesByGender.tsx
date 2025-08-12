
import React, { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";

const SalesByGender: React.FC = () => {
  // Chart
  // State for dynamically loaded Chart component
  const [ChartComponent, setChartComponent] =
    useState<React.ComponentType<any> | null>(null);

  // Dynamically import react-apexcharts
  useEffect(() => {
    import("react-apexcharts").then((module) => {
      setChartComponent(() => module.default);
    });
  }, []);

  const series = [70, 30];

  const options: ApexOptions = {
    labels: ["Male", "Female"],
    colors: ["#3584FC", "#AD63F6"],
    dataLabels: {
      enabled: false,
    },
    legend: {
      show: true,
      offsetX: 0,
      offsetY: 15,
      fontSize: "12px",
      position: "right",
      horizontalAlign: "center",
      itemMargin: {
        horizontal: 0,
        vertical: 5,
      },
      labels: {
        colors: "#64748B",
      },
      markers: {
        size: 6,
        offsetX: -4,
        offsetY: -0.5,
        shape: "square",
      },
    },
    tooltip: {
      y: {
        formatter: function (val) {
          return val + "%";
        },
      },
    },
  };

  return (
    <>
      <div className="trezo-card bg-white dark:bg-[#0c1427] p-[20px] md:p-[25px] rounded-md">
        <div className="trezo-card-header mb-[20px] md:mb-[25px] flex items-center justify-between">
          <div className="trezo-card-title">
            <h5 className="!mb-0">Sales By Gender</h5>
          </div>
        </div>
        <div className="trezo-card-content">
          <div className="-mt-[5px] ltr:-ml-[15px] rtl:-mr-[15px] -mb-[8px]">
            {ChartComponent ? (
              <ChartComponent
                options={options}
                series={series}
                type="donut"
                height={130}
                width={"100%"}
              />
            ) : (
              <div>Loading chart...</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default SalesByGender;
